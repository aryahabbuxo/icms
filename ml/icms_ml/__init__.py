"""ICMS ML package. Signatures follow the Shared Spec ML contract and must not change.

Status
    REAL   preprocess (PII masking + kn/hi translation), classify (trained TF-IDF + LogReg)
    STUB   extract_entities, embed, find_duplicate, score_fraud, ocr, nl_to_sql  (replaced next)

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
    return [{"text": "Bengaluru", "label": "LOC"}]


def embed(text: str) -> list[float]:
    return [0.0] * EMBED_DIM


def find_duplicate(embedding: list[float], candidates: list[dict], threshold: float = 0.85) -> dict:
    """candidates = [{"claim_id": int, "embedding": [...]}]"""
    return {"is_duplicate": False, "similar_claim_id": None, "similarity": 0.0}


def score_fraud(features: dict) -> dict:
    score = 0.35
    return {"score": score, "level": fraud_level(score), "reasons": [
        {"feature": "amount_ratio", "value": features.get("amount_ratio", 0.4), "impact": 1.0,
         "message": "Claimed amount is 40% of the sum insured"}]}


def ocr(image_bytes: bytes) -> str:
    return ""


def nl_to_sql(question: str, schema_text: str) -> str:
    return "SELECT COUNT(*) AS total_claims FROM CLAIM"


__all__ = ["CATEGORIES", "URGENCIES", "ENTITY_LABELS", "EMBED_DIM", "fraud_level", "preprocess", "classify",
           "extract_entities", "embed", "find_duplicate", "score_fraud", "ocr", "nl_to_sql"]
