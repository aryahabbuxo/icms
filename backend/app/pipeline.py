"""The 8-step claim filing pipeline (Shared Spec). Filing never fails because a model or Mongo failed."""
import concurrent.futures as cf
import datetime as dt
import json
import logging
from sqlalchemy import text
from . import db_mongo, ml
from .db_mysql import get_conn
from .errors import ApiError

log = logging.getLogger("icms.pipeline")
_pool = cf.ThreadPoolExecutor(max_workers=4)
CATEGORIES = {"accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"}
URGENCIES = {"low", "medium", "high", "critical"}


def safe(fn, default, *args, label=""):
    """Run an ML call with a 10 s timeout; on any failure log and return the default."""
    try:
        return _pool.submit(fn, *args).result(timeout=10)
    except Exception as e:
        log.warning("step %s failed: %s", label or getattr(fn, "__name__", "?"), e)
        return default


def mongo_try(fn, default=None, label=""):
    try:
        return fn()
    except Exception as e:
        log.warning("mongo %s failed: %s", label, e)
        return default


FEATURE_SQL = """
SELECT c.claimed_amount, p.sum_insured, c.claimed_amount / p.sum_insured AS amount_ratio,
  DATEDIFF(c.filed_date, p.start_date) AS policy_age_days,
  DATEDIFF(c.filed_date, c.incident_date) AS days_incident_to_filing,
  (SELECT COUNT(*) FROM CLAIM x WHERE x.policy_id = c.policy_id AND x.claim_id <> c.claim_id
     AND x.filed_date >= DATE_SUB(c.filed_date, INTERVAL 365 DAY)) AS claims_on_policy_last_year,
  (SELECT COUNT(*) FROM CLAIM x JOIN POLICY px ON px.policy_id = x.policy_id
     WHERE px.customer_id = p.customer_id AND x.claim_id <> c.claim_id) AS claims_by_customer_total,
  (SELECT COUNT(*) FROM PREMIUM_PAYMENT pp WHERE pp.policy_id = c.policy_id AND pp.status = 'failed') AS premium_payments_missed
FROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id WHERE c.claim_id = :cid
"""


def file_claim(user: dict, req) -> dict:
    email = user["email"]

    # ---- Step 1: stored procedure; triggers reject inactive policy / over-limit amount (-> 422) ----
    with get_conn(email) as conn:
        pol = conn.execute(text("SELECT policy_id, customer_id FROM POLICY WHERE policy_id = :p"),
                           {"p": req.policy_id}).mappings().first()
        if not pol:
            raise ApiError(404, "POLICY_NOT_FOUND", "Policy not found")
        if pol["customer_id"] != user.get("customer_id"):
            raise ApiError(403, "FORBIDDEN", "This policy does not belong to you")
        conn.execute(text("CALL sp_file_claim(:p, :d, :a, :s, @cid)"),
                     {"p": req.policy_id, "d": req.incident_date, "a": req.claimed_amount, "s": "Claim filed"})
        claim_id = conn.execute(text("SELECT @cid")).scalar()

    # ---- Step 2: NLP (each call guarded; defaults if a model fails) ----
    pre = safe(ml.preprocess, {"translated_text": req.narrative, "masked_text": req.narrative},
               req.narrative, req.language, label="preprocess")
    translated, masked = pre["translated_text"], pre["masked_text"]
    nlp = safe(ml.classify, {"category": "other", "urgency": "medium", "confidence": 0.0}, translated, label="classify")
    entities = safe(ml.extract_entities, [], translated, label="entities")
    embedding = safe(ml.embed, [], translated, label="embed")
    category = nlp.get("category") if nlp.get("category") in CATEGORIES else "other"
    urgency = nlp.get("urgency") if nlp.get("urgency") in URGENCIES else "medium"
    confidence = float(nlp.get("confidence", 0.0) or 0.0)
    nlp_out = {"category": category, "urgency": urgency, "confidence": confidence, "entities": entities}

    # ---- Step 3: narrative + NLP output + embedding to Mongo ----
    mongo_try(lambda: db_mongo.narratives.insert_one({
        "claim_id": claim_id, "original_text": req.narrative, "language": req.language,
        "translated_text": translated, "masked_text": masked, "nlp": nlp_out, "embedding": embedding,
        "created_at": dt.datetime.utcnow()}), label="save narrative")

    # ---- Step 4: duplicate check against the customer's claims + the last 500 ----
    dup = {"is_duplicate": False, "similar_claim_id": None, "similarity": 0.0}
    if embedding:
        with get_conn(email) as conn:
            own_ids = [r[0] for r in conn.execute(text(
                "SELECT c.claim_id FROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id "
                "WHERE p.customer_id = :c AND c.claim_id <> :id"), {"c": user["customer_id"], "id": claim_id})]
        def load():
            q = {"embedding": {"$exists": True, "$ne": []}, "claim_id": {"$ne": claim_id}}
            recent = list(db_mongo.narratives.find(q, {"_id": 0, "claim_id": 1, "embedding": 1}).sort("created_at", -1).limit(500))
            mine = list(db_mongo.narratives.find({**q, "claim_id": {"$in": own_ids}}, {"_id": 0, "claim_id": 1, "embedding": 1})) if own_ids else []
            return {c["claim_id"]: c for c in recent + mine}.values()
        candidates = list(mongo_try(load, [], label="load candidates"))
        dup = safe(ml.find_duplicate, dup, embedding, candidates, label="duplicate")

    # ---- Step 5: fraud features (one SQL query) -> score -> fraud_explanations ----
    with get_conn(email) as conn:
        row = conn.execute(text(FEATURE_SQL), {"cid": claim_id}).mappings().first()
    counts = {"policy_age_days", "days_incident_to_filing", "claims_on_policy_last_year",
              "claims_by_customer_total", "premium_payments_missed"}
    features = {k: (int(v or 0) if k in counts else float(v or 0.0)) for k, v in row.items()}
    features["max_similarity"] = float(dup.get("similarity", 0.0))
    features["category"] = category
    fraud = safe(ml.score_fraud, {"score": 0.5, "level": "medium", "reasons": []}, features, label="fraud")
    score = max(0.0, min(1.0, float(fraud.get("score", 0.5))))
    reasons = (fraud.get("reasons") or [])[:3]
    mongo_try(lambda: db_mongo.fraud_explanations.insert_one({
        "claim_id": claim_id, "fraud_score": score, "features": features, "top_reasons": reasons,
        "model_version": ml.ML_SOURCE, "scored_at": dt.datetime.utcnow()}), label="save fraud")

    # ---- Step 6: write results back to the CLAIM row ----
    similar = dup.get("similar_claim_id") if dup.get("is_duplicate") else None
    with get_conn(email) as conn:
        conn.execute(text(
            "UPDATE CLAIM SET category = :cat, urgency = :urg, nlp_confidence = :conf, fraud_score = :fs, "
            "fraud_reasons = :fr, duplicate_of = :dup, description_summary = :sum WHERE claim_id = :id"),
            {"cat": category, "urg": urgency, "conf": round(confidence, 3), "fs": round(score, 3),
             "fr": json.dumps(reasons), "dup": similar, "sum": masked[:300], "id": claim_id})

        # ---- Step 7: assign adjuster (sets status under_review; trigger logs it) ----
        conn.execute(text("CALL sp_assign_adjuster(:id, @aid)"), {"id": claim_id})
        adj_id = conn.execute(text("SELECT @aid")).scalar()
        adj = conn.execute(text("SELECT adjuster_id, name FROM ADJUSTER WHERE adjuster_id = :a"), {"a": adj_id}).mappings().first()

        # ---- Step 8: notifications ----
        conn.execute(text("INSERT INTO NOTIFICATION (user_id, claim_id, message) VALUES (:u, :c, :m)"),
                     {"u": user["user_id"], "c": claim_id, "m": f"Claim #{claim_id} filed and is under review."})
        if adj:
            au = conn.execute(text("SELECT user_id FROM APP_USER WHERE adjuster_id = :a"), {"a": adj["adjuster_id"]}).scalar()
            if au:
                conn.execute(text("INSERT INTO NOTIFICATION (user_id, claim_id, message) VALUES (:u, :c, :m)"),
                             {"u": au, "c": claim_id, "m": f"New {urgency}-urgency claim #{claim_id} assigned to you (risk {score:.2f})."})

    return {"claim_id": claim_id, "status": "under_review", "nlp": nlp_out,
            "fraud": {"score": round(score, 3), "level": fraud.get("level", "medium"), "reasons": reasons},
            "duplicate": {"is_duplicate": bool(dup.get("is_duplicate")), "similar_claim_id": similar,
                          "similarity": round(float(dup.get("similarity", 0.0)), 3)},
            "assigned_adjuster": {"adjuster_id": adj["adjuster_id"], "name": adj["name"]} if adj else None}
