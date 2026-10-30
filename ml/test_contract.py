"""Run: python test_contract.py  — checks every function returns the Shared Spec shape.
Keep running this after replacing stubs with real models; it must always pass."""
import icms_ml as m

p = m.preprocess("Call me on 9876543210", "en"); assert set(p) == {"translated_text", "masked_text"}
c = m.classify("My bike was hit near Silk Board")
assert c["category"] in m.CATEGORIES and c["urgency"] in m.URGENCIES and 0 <= c["confidence"] <= 1
for e in m.extract_entities("Admitted to Manipal Hospital, Bengaluru"):
    assert set(e) == {"text", "label"} and e["label"] in m.ENTITY_LABELS
v = m.embed("test"); assert len(v) == m.EMBED_DIM
d = m.find_duplicate(v, [{"claim_id": 1, "embedding": v}]); assert set(d) == {"is_duplicate", "similar_claim_id", "similarity"}
f = m.score_fraud({"claimed_amount": 85000, "sum_insured": 200000, "amount_ratio": 0.425, "policy_age_days": 9,
                   "days_incident_to_filing": 1, "claims_on_policy_last_year": 0, "claims_by_customer_total": 1,
                   "premium_payments_missed": 0, "max_similarity": 0.4, "category": "accident"})
assert 0 <= f["score"] <= 1 and f["level"] == m.fraud_level(f["score"]) and len(f["reasons"]) <= 3
assert all(set(r) == {"feature", "value", "impact", "message"} for r in f["reasons"])
assert isinstance(m.ocr(b""), str)
assert m.nl_to_sql("how many claims", "").lstrip().upper().startswith("SELECT")
print("icms_ml contract OK")
