"""ICMS ML package. Signatures follow the Shared Spec ML contract and must not change.

STUB VERSION (Fri 30 Oct): every function returns a fixed, well-formed answer so the
backend can integrate now. Real implementations replace the bodies on Sat/Sun.
"""
from __future__ import annotations

CATEGORIES = ["accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"]
URGENCIES = ["low", "medium", "high", "critical"]
ENTITY_LABELS = ["PERSON", "LOC", "DATE", "MONEY", "ORG", "VEHICLE_NO", "HOSPITAL"]
EMBED_DIM = 384


def fraud_level(score: float) -> str:
    """< 0.4 low, 0.4-0.7 medium, >= 0.7 high (Shared Spec)."""
    return "high" if score >= 0.7 else "medium" if score >= 0.4 else "low"


def preprocess(text: str, language: str = "en") -> dict:
    """Translate kn/hi to English if needed, then mask PII."""
    return {"translated_text": text, "masked_text": text}


def classify(text: str) -> dict:
    return {"category": "accident", "urgency": "high", "confidence": 0.88}


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
