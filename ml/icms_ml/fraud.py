"""Fraud scoring with plain-English reasons (shared by train_fraud.py and icms_ml.score_fraud).

Explainability: for a logistic regression on standardised features, each feature's contribution to the
log-odds is exactly coef * z. The three largest positive contributions are the reasons shown to adjusters.
"""
from __future__ import annotations

NUM = ["amount_ratio", "policy_age_days", "days_incident_to_filing", "claims_on_policy_last_year",
       "claims_by_customer_total", "premium_payments_missed", "max_similarity"]
CAT = ["category"]
# Days and counts matter most near zero (9 vs 30 days after purchase), so they are log-scaled before standardising.
LOG_COLS = ["policy_age_days", "days_incident_to_filing", "claims_on_policy_last_year",
            "claims_by_customer_total", "premium_payments_missed"]


def log_scale(X):
    """Module-level so joblib can reload the trained pipeline in the backend."""
    import numpy as np
    X = np.asarray(X, dtype=float).copy()
    for i, name in enumerate(NUM):
        if name in LOG_COLS:
            X[:, i] = np.log1p(np.clip(X[:, i], 0, None))
    return X
MIN_CONTRIBUTION = 0.35   # log-odds; smaller pushes are not worth showing as a "reason"


def _plural(v, one, many):
    return f"{v} {one if v == 1 else many}"


MESSAGES = {
    "amount_ratio": lambda f: f"Claimed amount is {f['amount_ratio']:.0%} of the sum insured",
    "policy_age_days": lambda f: f"Claim filed {_plural(int(f['policy_age_days']), 'day', 'days')} after the policy started",
    "days_incident_to_filing": lambda f: f"Reported {_plural(int(f['days_incident_to_filing']), 'day', 'days')} after the incident",
    "claims_on_policy_last_year": lambda f: f"{_plural(int(f['claims_on_policy_last_year']), 'other claim', 'other claims')} on this policy in the last 12 months",
    "claims_by_customer_total": lambda f: f"Customer has filed {_plural(int(f['claims_by_customer_total']), 'claim', 'claims')} in total",
    "premium_payments_missed": lambda f: f"{_plural(int(f['premium_payments_missed']), 'premium payment', 'premium payments')} failed before this claim",
    "max_similarity": lambda f: f"Description is {f['max_similarity']:.0%} similar to an earlier claim",
}


def prepare(features: dict) -> dict:
    """Fill derived fields and defaults so partial feature dicts from the backend still score."""
    f = {k: features.get(k) for k in ("claimed_amount", "sum_insured", "amount_ratio", "policy_age_days",
                                      "days_incident_to_filing", "claims_on_policy_last_year",
                                      "claims_by_customer_total", "premium_payments_missed", "max_similarity", "category")}
    f["claimed_amount"] = float(f["claimed_amount"] or 0)
    f["sum_insured"] = float(f["sum_insured"] or 0)
    if f["amount_ratio"] is None:
        f["amount_ratio"] = f["claimed_amount"] / f["sum_insured"] if f["sum_insured"] else 0.0
    defaults = {"policy_age_days": 365, "days_incident_to_filing": 1, "claims_on_policy_last_year": 0,
                "claims_by_customer_total": 1, "premium_payments_missed": 0, "max_similarity": 0.0, "category": "other"}
    for k, v in defaults.items():
        if f[k] is None:
            f[k] = v
    return f


def explain(pipeline, f: dict, score: float) -> list[dict]:
    """Top-3 positive log-odds contributions, turned into sentences. Impacts sum to 1."""
    import pandas as pd
    pre, lr = pipeline.named_steps["pre"], pipeline.named_steps["lr"]
    z = pre.transform(pd.DataFrame([f])[NUM + CAT])[0][: len(NUM)]
    contrib = lr.coef_[0][: len(NUM)] * z
    top = sorted(((c, name) for c, name in zip(contrib, NUM) if c >= MIN_CONTRIBUTION), reverse=True)[:3]
    if score < 0.4:   # a low-risk claim gets no accusatory reasons
        return []
    total = sum(c for c, _ in top) or 1.0
    return [{"feature": name, "value": round(float(f[name]), 3),
             "impact": round(float(c / total), 2), "message": MESSAGES[name](f)} for c, name in top]
