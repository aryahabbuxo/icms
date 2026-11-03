"""Synthetic labelled claims for the fraud model (stand-in until A exports claims_labeled.csv from MySQL).

    python generate_fraud_data.py            # writes claims_labeled.csv (8,000 rows, ~8% fraud)

Columns match the Shared Spec fraud features exactly, plus the label `is_fraud`:
    claimed_amount, sum_insured, amount_ratio, policy_age_days, days_incident_to_filing,
    claims_on_policy_last_year, claims_by_customer_total, premium_payments_missed, max_similarity, category, is_fraud

How the data is built (say this in the viva)
    * Genuine claims: moderate amounts (median ~20% of cover), policies of any age, filed within days,
      rarely repeat claimants, narratives unlike earlier ones.
    * Fraud claims carry 1-3 common red flags: a claim soon after buying the policy, an amount near the
      full cover, repeat claims, late reporting, missed premiums before the claim, or a narrative
      copied from another claim. (These rules are our assumption; real labels would replace them.)
    * 18% of genuine claims also carry one red flag, and 30% of fraud claims carry only one,
      so the classes overlap and the model cannot reach a perfect score.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

CATS = ["accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"]
CAT_P = [0.2, 0.13, 0.2, 0.09, 0.1, 0.1, 0.06, 0.12]
COVER = {  # sum insured range in rupees by claim category
    "accident": (1_00_000, 3_00_000), "theft": (50_000, 3_00_000), "hospitalisation": (3_00_000, 10_00_000),
    "fire": (5_00_000, 25_00_000), "flood": (2_00_000, 15_00_000), "travel_loss": (50_000, 2_00_000),
    "death": (10_00_000, 50_00_000), "other": (50_000, 5_00_000),
}
FLAGS = ["early", "high_amount", "repeat", "late", "missed", "copied"]
FLAG_P = [0.24, 0.24, 0.16, 0.12, 0.12, 0.12]


def _row(rng: np.random.Generator, fraud: bool) -> dict:
    cat = rng.choice(CATS, p=CAT_P)
    lo, hi = COVER[cat]
    sum_insured = float(round(rng.uniform(lo, hi), -4))

    # genuine baseline
    ratio = rng.beta(2, 7)
    age = rng.integers(20, 1100)
    late = int(rng.geometric(0.35)) - 1
    repeat = int(rng.poisson(0.25))
    total = repeat + int(rng.poisson(0.6)) + 1
    missed = int(rng.poisson(0.12))
    sim = rng.beta(3, 6)

    if fraud:
        n = rng.choice([1, 2, 3], p=[0.30, 0.50, 0.20])
    else:
        n = 1 if rng.random() < 0.18 else 0
    for f in rng.choice(FLAGS, size=n, replace=False, p=FLAG_P):
        if f == "early":
            age = rng.integers(1, 45)
        elif f == "high_amount":
            ratio = rng.beta(9, 1.6)
        elif f == "repeat":
            repeat = int(rng.integers(2, 6)); total = repeat + int(rng.integers(1, 4))
        elif f == "late":
            late = int(rng.integers(20, 120))
        elif f == "missed":
            missed = int(rng.integers(1, 4))
        elif f == "copied":
            sim = rng.uniform(0.8, 0.98)

    ratio = float(np.clip(ratio, 0.01, 1.0))
    return {
        "claimed_amount": round(ratio * sum_insured, -2), "sum_insured": sum_insured, "amount_ratio": round(ratio, 4),
        "policy_age_days": int(age), "days_incident_to_filing": int(late),
        "claims_on_policy_last_year": int(repeat), "claims_by_customer_total": int(total),
        "premium_payments_missed": int(missed), "max_similarity": round(float(sim), 3),
        "category": str(cat), "is_fraud": int(fraud),
    }


def build(n: int = 8000, fraud_rate: float = 0.08, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame([_row(rng, rng.random() < fraud_rate) for _ in range(n)])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--out", default=str(Path(__file__).with_name("claims_labeled.csv")))
    a = ap.parse_args()
    df = build(a.n)
    df.to_csv(a.out, index=False)
    print(f"Wrote {len(df)} rows to {a.out}  (fraud rate {df.is_fraud.mean():.1%})")


if __name__ == "__main__":
    main()
