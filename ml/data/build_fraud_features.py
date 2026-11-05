"""Build the fraud model's training table from the real seeded database.

    python data/build_fraud_features.py          (run from the ml/ folder, after demo-reset, with Docker running)

Reads   data/claims_labeled.csv     labels written by A's seed (claim_id + is_fraud, any extra columns ignored)
        MySQL (MYSQL_URL in ../.env) CLAIM, POLICY, PREMIUM_PAYMENT
Writes  data/fraud_training.csv     the 10 Shared Spec features + is_fraud, one row per labelled claim

The features are computed exactly as the backend computes them when a claim is filed, so the model is trained on
the same inputs it will see in production. max_similarity uses the same embedder as find_duplicate(): each claim's
description is compared with every claim stored before it.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent          # ml/
sys.path.insert(0, str(ROOT))

FEATURE_SQL = """
SELECT c.claim_id, c.claimed_amount, p.sum_insured, p.customer_id, c.category,
       c.filed_date, c.description_summary AS text,
       c.claimed_amount / p.sum_insured                                   AS amount_ratio,
       DATEDIFF(c.filed_date, p.start_date)                               AS policy_age_days,
       DATEDIFF(c.filed_date, c.incident_date)                            AS days_incident_to_filing,
       (SELECT COUNT(*) FROM CLAIM c2
         WHERE c2.policy_id = c.policy_id AND c2.claim_id <> c.claim_id
           AND c2.filed_date BETWEEN c.filed_date - INTERVAL 365 DAY AND c.filed_date)  AS claims_on_policy_last_year,
       (SELECT COUNT(*) FROM CLAIM c3 JOIN POLICY p3 ON p3.policy_id = c3.policy_id
         WHERE p3.customer_id = p.customer_id AND c3.filed_date <= c.filed_date)       AS claims_by_customer_total,
       (SELECT COUNT(*) FROM PREMIUM_PAYMENT pp
         WHERE pp.policy_id = c.policy_id AND pp.status = 'failed' AND pp.pay_date <= c.filed_date) AS premium_payments_missed
  FROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id
"""


def mysql_url() -> str:
    url = os.getenv("MYSQL_URL")
    env = ROOT.parent / ".env"
    if not url and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("MYSQL_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not url:
        raise SystemExit("MYSQL_URL not found. Add it to the .env file in the icms folder (see .env.example).")
    return url


def connect():
    import pymysql
    u = urlparse(mysql_url().replace("mysql+pymysql://", "mysql://"))
    return pymysql.connect(host=u.hostname or "localhost", port=u.port or 3306, user=unquote(u.username or "root"),
                           password=unquote(u.password or ""), database=(u.path or "/icms").lstrip("/") or "icms",
                           charset="utf8mb4")


def read_labels(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    cols = {c.lower().strip(): c for c in df.columns}
    id_col = cols.get("claim_id") or df.columns[0]
    lab_col = cols.get("is_fraud") or cols.get("label") or cols.get("fraud") or df.columns[1]
    out = pd.DataFrame({"claim_id": df[id_col].astype(int), "is_fraud": df[lab_col].astype(int)})
    print(f"labels: {len(out)} claims ({out.is_fraud.sum()} fraud), columns used: {id_col}, {lab_col}")
    return out


def max_similarity(df: pd.DataFrame) -> np.ndarray:
    """Similarity to the closest claim that was already in the database (lower claim_id), using the production
    embedder. Insertion order is what the live check sees; seeded filed dates are random, so they are not used."""
    from icms_ml import SAME_CUSTOMER_THRESHOLD, _embedder  # noqa: F401  (same model as find_duplicate)
    model = _embedder()
    if model is None:
        print("embedder model missing: max_similarity set to 0 (run train_embedder.py first)")
        return np.zeros(len(df))
    order = df.sort_values("claim_id").index.to_numpy()
    E = model.transform(df.loc[order, "text"].fillna("").tolist()).astype(np.float32)
    sims = E @ E.T
    np.fill_diagonal(sims, -1)
    sims[np.triu_indices(len(order))] = -1          # only compare with claims already stored
    best = sims.max(axis=1).clip(min=0)
    out = np.zeros(len(df))
    out[df.index.get_indexer(order)] = best
    return out


def main() -> None:
    labels = read_labels(ROOT / "data" / "claims_labeled.csv")
    with connect() as conn:
        feats = pd.read_sql(FEATURE_SQL, conn)
    print(f"features: {len(feats)} claims read from MySQL")
    df = feats.merge(labels, on="claim_id", how="inner").reset_index(drop=True)
    if df.empty:
        raise SystemExit("No claim_id in claims_labeled.csv matched the database. Run demo-reset again.")
    df["max_similarity"] = max_similarity(df).round(3)
    keep = ["claim_id", "claimed_amount", "sum_insured", "amount_ratio", "policy_age_days", "days_incident_to_filing",
            "claims_on_policy_last_year", "claims_by_customer_total", "premium_payments_missed", "max_similarity",
            "category", "is_fraud"]
    df = df[keep]
    df["amount_ratio"] = df["amount_ratio"].astype(float).round(4)
    out = ROOT / "data" / "fraud_training.csv"
    df.to_csv(out, index=False)
    print(f"wrote {out} ({len(df)} rows, {df.is_fraud.mean():.1%} fraud)")
    print(df.groupby("is_fraud")[["amount_ratio", "policy_age_days", "claims_on_policy_last_year",
                                  "premium_payments_missed", "max_similarity"]].mean().round(2).to_string())


if __name__ == "__main__":
    main()
