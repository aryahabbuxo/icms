"""Stand-in for B's icms_ml package: same signatures as the Shared Spec, simple rules.
Used only when `import icms_ml` fails. Swap is automatic (see ml.py)."""
import math
import re
import zlib

CATEGORIES = ["accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"]
_KEYWORDS = {
    "theft": ["stolen", "theft", "burglar", "robbery", "broke into", "taken"],
    "fire": ["fire", "burnt", "short circuit", "burned"],
    "flood": ["flood", "waterlogged", "heavy rain"],
    "hospitalisation": ["hospital", "admitted", "hospitalised", "surgery", "discharge"],
    "death": ["death", "deceased", "died", "nominee"],
    "travel_loss": ["baggage", "luggage", "flight", "trip", "hotel booking"],
    "accident": ["accident", "skid", "collision", "rammed", "crash", "hit by", "struck"],
}
_PLACES = ["Silk Board", "Hebbal", "Electronic City", "Whitefield", "Koramangala", "Indiranagar", "Marathahalli",
           "Jayanagar", "Outer Ring Road", "Yeshwanthpur", "Bannerghatta Road", "KR Puram"]
_HOSPITALS = ["Manipal Hospital", "Apollo Hospital", "Fortis Hospital", "Narayana Health", "Columbia Asia"]


def preprocess(text: str, language: str = "en") -> dict:
    translated = text  # no translation in the fallback
    masked = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[EMAIL]", translated)
    masked = re.sub(r"(?<!\d)(?:\+?91[- ]?)?[6-9]\d{9}(?!\d)", "[PHONE]", masked)
    masked = re.sub(r"\b(?:Mr|Mrs|Ms|Shri|Smt|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?", "[NAME]", masked)
    return {"translated_text": translated, "masked_text": masked}


def classify(text: str) -> dict:
    t = text.lower()
    best, hits = "other", 0
    for cat, words in _KEYWORDS.items():
        n = sum(w in t for w in words)
        if n > hits:
            best, hits = cat, n
    urgency = {"death": "critical", "fire": "high", "flood": "high", "accident": "medium",
               "theft": "medium", "hospitalisation": "medium", "travel_loss": "low", "other": "low"}[best]
    if best in ("accident", "hospitalisation") and re.search(r"icu|emergency|critical|injur|fracture|surgery", t):
        urgency = "high"
    return {"category": best, "urgency": urgency, "confidence": round(min(0.9, 0.5 + 0.1 * hits), 3) if hits else 0.4}


def extract_entities(text: str) -> list:
    ents = []
    for m in re.finditer(r"(?:Rs\.?|INR|₹)\s?[\d,]+", text):
        ents.append({"text": re.sub(r"[^\d]", "", m.group()), "label": "MONEY"})
    for m in re.finditer(r"\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b", text):
        ents.append({"text": m.group(), "label": "VEHICLE_NO"})
    for p in _PLACES:
        if p.lower() in text.lower():
            ents.append({"text": p, "label": "LOC"})
    for h in _HOSPITALS:
        if h.lower() in text.lower():
            ents.append({"text": h, "label": "HOSPITAL"})
    return ents


def embed(text: str) -> list:
    v = [0.0] * 384
    for tok in re.findall(r"[a-z0-9]+", text.lower()):
        v[zlib.crc32(tok.encode()) % 384] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def find_duplicate(embedding: list, candidates: list, threshold: float = 0.85) -> dict:
    best_id, best = None, 0.0
    for c in candidates:
        e = c.get("embedding")
        if not e or len(e) != len(embedding):
            continue
        s = sum(a * b for a, b in zip(embedding, e))
        if s > best:
            best_id, best = c["claim_id"], s
    return {"is_duplicate": best >= threshold, "similar_claim_id": best_id if best >= threshold else None,
            "similarity": round(best, 3)}


def score_fraud(features: dict) -> dict:
    f = features
    items = []  # (impact, feature, value, message)
    if f.get("amount_ratio", 0) > 0.9:
        items.append((0.30, "amount_ratio", round(f["amount_ratio"], 2), f"Claimed amount is {int(100 * f['amount_ratio'])}% of the sum insured"))
    if f.get("policy_age_days", 999) < 30:
        items.append((0.30, "days_policy_to_claim", f["policy_age_days"], f"Claim filed {f['policy_age_days']} days after policy start"))
    if f.get("claims_on_policy_last_year", 0) >= 2:
        items.append((0.25, "claims_on_policy_last_year", f["claims_on_policy_last_year"], f"{f['claims_on_policy_last_year'] + 1} claims on this policy within a year"))
    if f.get("max_similarity", 0) >= 0.85:
        items.append((0.30, "max_similarity", round(f["max_similarity"], 2), "Narrative is very similar to an earlier claim"))
    if f.get("premium_payments_missed", 0) >= 1:
        items.append((0.15, "premium_payments_missed", f["premium_payments_missed"], "Premium payments failed before this claim"))
    if f.get("days_incident_to_filing", 0) > 30:
        items.append((0.10, "days_incident_to_filing", f["days_incident_to_filing"], f"Claim filed {f['days_incident_to_filing']} days after the incident"))
    items.sort(reverse=True)
    score = round(min(1.0, 0.1 + sum(i[0] for i in items)), 3)
    level = "low" if score < 0.4 else "medium" if score < 0.7 else "high"
    return {"score": score, "level": level,
            "reasons": [{"feature": n, "value": v, "impact": i, "message": m} for i, n, v, m in items[:3]]}


def ocr(image_bytes: bytes) -> str:
    return ""


def nl_to_sql(question: str, schema_text: str) -> str:
    raise NotImplementedError("LLM not available in fallback")
