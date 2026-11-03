"""ICMS ML package. Signatures follow the Shared Spec ML contract and must not change.

Status
    All functions are real. OCR needs the Tesseract program; NL-to-SQL and translation use an LLM when LLM_API_KEY
    is set and fall back to templates / keywords without it, so the demo works offline.

Models load lazily, once, on first use (A's backend can import this package instantly).
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from functools import lru_cache
from pathlib import Path

CATEGORIES = ["accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"]
URGENCIES = ["low", "medium", "high", "critical"]
ENTITY_LABELS = ["PERSON", "LOC", "DATE", "MONEY", "ORG", "VEHICLE_NO", "HOSPITAL"]
EMBED_DIM = 384
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def fraud_level(score: float) -> str:
    """< 0.4 low, 0.4-0.7 medium, >= 0.7 high (Shared Spec)."""
    return "high" if score >= 0.7 else "medium" if score >= 0.4 else "low"


# --------------------------------------------------------------------------- LLM helper (Gemini REST, no SDK needed)
def _llm(prompt: str, timeout: float = 12.0) -> str | None:
    """Call Gemini if LLM_API_KEY is set. Returns None on any failure so callers can fall back."""
    key = os.getenv("LLM_API_KEY")
    if not key:
        return None
    model = os.getenv("LLM_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 0}}).encode()
    try:
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.load(r)
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


# --------------------------------------------------------------------------- preprocess
_PHONE = re.compile(r"(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")
_NAME_INTRO = re.compile(r"\b(?:I am|I'm|my name is|this is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)", re.I)


def _mask(text: str) -> str:
    text = _PHONE.sub("[PHONE]", text)
    text = _EMAIL.sub("[EMAIL]", text)
    return _NAME_INTRO.sub(lambda m: m.group(0).replace(m.group(1), "[NAME]"), text)


def preprocess(text: str, language: str = "en") -> dict:
    """Translate kn/hi to English (LLM, if a key is configured), then mask phone numbers, emails and names."""
    translated = text
    if language in ("kn", "hi"):
        out = _llm("Translate this insurance claim description to English. Keep numbers, names and "
                   f"vehicle numbers exactly. Output only the translation.\n\n{text}")
        if out:
            translated = out
    return {"translated_text": translated, "masked_text": _mask(translated)}


# --------------------------------------------------------------------------- classify
@lru_cache(maxsize=1)
def _classifiers():
    import joblib  # local import keeps `import icms_ml` fast
    cat, urg = MODELS_DIR / "category_clf.joblib", MODELS_DIR / "urgency_clf.joblib"
    if not (cat.exists() and urg.exists()):
        return None
    return joblib.load(cat), joblib.load(urg)


# Fallback when text is still Kannada/Hindi (no LLM key / no internet): keyword rules.
_NATIVE = [("theft", r"ಕಳ್ಳ|चोरी"), ("flood", r"ಮಳೆ|ನೀರು|बारिश|पानी|बाढ़"), ("hospitalisation", r"ಆಸ್ಪತ್ರೆ|अस्पताल"),
           ("accident", r"ಅಪಘಾತ|दुर्घटना"), ("fire", r"ಬೆಂಕಿ|आग"), ("death", r"ನಿಧನ|मृत्यु|निधन")]


def _mostly_non_latin(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and sum(c.isascii() for c in letters) / len(letters) < 0.5


def classify(text: str) -> dict:
    """{"category", "urgency", "confidence"} from the trained models (keyword fallback if unavailable)."""
    if _mostly_non_latin(text):
        cat = next((c for c, pat in _NATIVE if re.search(pat, text)), "other")
        return {"category": cat, "urgency": "medium", "confidence": 0.5}
    models = _classifiers()
    if models is None:
        return {"category": "other", "urgency": "medium", "confidence": 0.0}
    cat_m, urg_m = models
    probs = cat_m.predict_proba([text])[0]
    i = probs.argmax()
    return {"category": str(cat_m.classes_[i]), "urgency": str(urg_m.predict([text])[0]),
            "confidence": round(float(probs[i]), 3)}


# --------------------------------------------------------------------------- stubs (replaced in the next modules)
def extract_entities(text: str) -> list[dict]:
    """[{"text", "label"}] using regex + Indian gazetteer + spaCy (spaCy optional)."""
    from .ner import extract
    return extract(text)


# --------------------------------------------------------------------------- embeddings + duplicates
@lru_cache(maxsize=1)
def _embedder():
    import joblib
    path = MODELS_DIR / "embedder_lsa.joblib"
    return joblib.load(path)["pipeline"] if path.exists() else None


@lru_cache(maxsize=1)
def _dup_threshold() -> float:
    try:
        return float(json.loads((MODELS_DIR.parent / "reports" / "metrics.json").read_text())["duplicate"]["threshold"])
    except Exception:
        return 0.86


def embed(text: str) -> list[float]:
    """384 floats, L2-normalised (offline LSA embedder trained by train_embedder.py)."""
    model = _embedder()
    if model is None:
        return [0.0] * EMBED_DIM
    return [round(float(x), 6) for x in model.transform([text])[0]]


SAME_CUSTOMER_THRESHOLD = 0.75   # policy choice: re-filing one's own old claim is the main duplicate-fraud pattern


def find_duplicate(embedding: list[float], candidates: list[dict], threshold: float | None = None) -> dict:
    """candidates = [{"claim_id": int, "embedding": [...], "same_customer": bool (optional)}].

    Cosine similarity = dot product (vectors are normalised). A claim is a duplicate when its similarity to an
    earlier claim reaches the threshold: the calibrated value from train_embedder.py (about 0.85) for any claim,
    or 0.75 when the earlier claim belongs to the same customer. A flag never rejects a claim; it raises the
    fraud score and routes the claim to a senior adjuster.
    """
    import numpy as np
    threshold = _dup_threshold() if threshold is None else threshold
    valid = [c for c in candidates if c.get("embedding") and len(c["embedding"]) == len(embedding)]
    if not valid or not any(embedding):
        return {"is_duplicate": False, "similar_claim_id": None, "similarity": 0.0}
    sims = np.asarray([c["embedding"] for c in valid], dtype=np.float32) @ np.asarray(embedding, dtype=np.float32)
    limits = np.asarray([min(threshold, SAME_CUSTOMER_THRESHOLD) if c.get("same_customer") else threshold for c in valid])
    over = sims - limits
    i = int(over.argmax()) if (over >= 0).any() else int(sims.argmax())
    best, dup = round(float(sims[i]), 3), bool(over[i] >= 0)
    return {"is_duplicate": dup, "similar_claim_id": valid[i]["claim_id"] if dup else None, "similarity": best}


@lru_cache(maxsize=1)
def _fraud_model():
    import joblib
    path = MODELS_DIR / "fraud_lr.joblib"
    return joblib.load(path) if path.exists() else None


def score_fraud(features: dict) -> dict:
    """{"score", "level", "reasons": [top 3 {"feature","value","impact","message"}]} from the explainable LR model."""
    from .fraud import CAT, NUM, explain, prepare
    f = prepare(features)
    art = _fraud_model()
    if art is None:   # model file missing: neutral score so filing never fails
        return {"score": 0.5, "level": "medium", "reasons": []}
    import pandas as pd
    pipe = art["pipeline"]
    score = round(float(pipe.predict_proba(pd.DataFrame([f])[NUM + CAT])[0, 1]), 3)
    return {"score": score, "level": fraud_level(score), "reasons": explain(pipe, f, score)}


# --------------------------------------------------------------------------- OCR
def ocr(image_bytes: bytes) -> str:
    """Text from a bill/FIR image with Tesseract. Returns "" if Tesseract or Pillow is missing, or on any error,
    so an upload never fails because OCR did. (Install the Tesseract program separately; see README.)"""
    try:
        import io
        import pytesseract
        from PIL import Image, ImageOps
        tess = os.getenv("TESSERACT_CMD")              # Windows: C:\\Program Files\\Tesseract-OCR\\tesseract.exe
        if tess:
            pytesseract.pytesseract.tesseract_cmd = tess
        img = ImageOps.grayscale(Image.open(io.BytesIO(image_bytes)))
        if img.width < 1200:                            # small phone photos read better when upscaled
            img = img.resize((img.width * 2, img.height * 2))
        return re.sub(r"[ \t]+", " ", pytesseract.image_to_string(img, config="--psm 6")).strip()
    except Exception:
        return ""


def bill_total(text: str) -> float | None:
    """Largest rupee amount in OCR text, e.g. to compare a bill's total with the claimed amount."""
    nums = [float(m.replace(",", "")) for m in re.findall(r"(?:₹|Rs\.?|INR|TOTAL|Total|PAYABLE|Payable)[:\s]*([\d,]{3,}(?:\.\d{1,2})?)", text)]
    return max(nums) if nums else None


# --------------------------------------------------------------------------- NL -> SQL
NL_EXAMPLES = [
    ("how many claims are pending",
     "SELECT COUNT(*) AS pending_claims FROM CLAIM WHERE status IN ('filed','under_review','info_requested')"),
    ("top 5 cities by high fraud claims this year",
     "SELECT city, COUNT(*) AS high_risk_claims FROM v_claim_dashboard WHERE fraud_score >= 0.7 AND YEAR(filed_date) = YEAR(CURDATE()) GROUP BY city ORDER BY high_risk_claims DESC LIMIT 5"),
    ("claims filed per month over the last 6 months",
     "SELECT DATE_FORMAT(filed_date, '%b %Y') AS month, COUNT(*) AS claims FROM CLAIM WHERE filed_date >= CURDATE() - INTERVAL 6 MONTH GROUP BY YEAR(filed_date), MONTH(filed_date), month ORDER BY YEAR(filed_date), MONTH(filed_date)"),
    ("average days to settle by policy type",
     "SELECT policy_type, ROUND(AVG(days_to_settle), 1) AS avg_days_to_settle FROM v_claim_dashboard WHERE settle_date IS NOT NULL GROUP BY policy_type ORDER BY avg_days_to_settle DESC"),
    ("which adjuster has the most open claims",
     "SELECT name, open_claims FROM v_adjuster_workload ORDER BY open_claims DESC LIMIT 5"),
    ("total amount settled for each claim category",
     "SELECT c.category, SUM(s.amount) AS total_settled FROM SETTLEMENT s JOIN CLAIM c ON c.claim_id = s.claim_id GROUP BY c.category ORDER BY total_settled DESC"),
]


def _fallback_sql(question: str) -> str:
    """Template whose question shares the most words with the asker's question (used when no LLM is available)."""
    words = set(re.findall(r"[a-z]+", question.lower())) - {"the", "a", "of", "by", "in", "for", "is", "are", "how", "what", "which", "many", "each"}
    best = max(NL_EXAMPLES, key=lambda ex: len(words & set(re.findall(r"[a-z]+", ex[0]))))
    return best[1]


def nl_to_sql(question: str, schema_text: str) -> str:
    """One MySQL SELECT for the question. Uses the LLM when LLM_API_KEY is set, else the closest template.
    The backend still validates the result (single SELECT, read-only user, row and time limits)."""
    shots = "\n".join(f"Q: {q}\nSQL: {sql}" for q, sql in NL_EXAMPLES)
    prompt = (
        "You translate questions into ONE MySQL 8 SELECT statement for an insurance claims database.\n"
        "Rules: output only SQL, no explanation, no code fences, no semicolon, no comments.\n"
        f"Use only these tables and views:\n{schema_text}\n"
        "Categories: accident, theft, hospitalisation, fire, flood, travel_loss, death, other.\n"
        "Claim statuses: filed, under_review, info_requested, approved, rejected, settled.\n"
        "High fraud means fraud_score >= 0.7. 'This year' means YEAR(filed_date) = YEAR(CURDATE()).\n"
        "Prefer the view v_claim_dashboard for questions about claims.\n\n"
        f"{shots}\n\nQ: {question}\nSQL:"
    )
    out = _llm(prompt)
    if out:
        out = re.sub(r"^```(?:sql)?\s*|\s*```$", "", out.strip(), flags=re.I).strip().rstrip(";")
        if out.upper().startswith(("SELECT", "WITH")):
            return out
    return _fallback_sql(question)


__all__ = ["CATEGORIES", "URGENCIES", "ENTITY_LABELS", "EMBED_DIM", "fraud_level", "preprocess", "classify",
           "extract_entities", "embed", "find_duplicate", "score_fraud", "ocr", "bill_total", "nl_to_sql", "NL_EXAMPLES"]
