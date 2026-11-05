"""Train the explainable fraud model and compare it with a black-box baseline.

Run from the ml/ folder:
    python train_fraud.py

Input   data/fraud_training.csv   (built from the real database by data/build_fraud_features.py)
        falls back to data/claims_labeled.csv in the synthetic format from data/generate_fraud_data.py
Output  models/fraud_lr.joblib, reports/metrics.json ("fraud" section), reports/fraud_drivers.png

Why logistic regression (viva answer)
    Gradient boosting scores a little higher, but logistic regression's reasons are exact: each feature's
    pull on the score is coef * standardised value. Adjusters see *why* a claim was flagged, and the
    synopsis promises explainable scores. class_weight="balanced" favours recall: a false flag only sends
    a claim to a senior adjuster, while a missed fraud costs money.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

sys.path.insert(0, str(Path(__file__).parent))
from icms_ml.fraud import CAT, NUM, log_scale  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).parent
REAL = ROOT / "data" / "fraud_training.csv"
SYNTH = ROOT / "data" / "claims_labeled.csv"
SEED = 42
PRETTY = {"amount_ratio": "Amount vs sum insured", "policy_age_days": "Policy age (log days)",
          "days_incident_to_filing": "Days to report (log)", "claims_on_policy_last_year": "Claims on policy, last year",
          "claims_by_customer_total": "Customer's total claims", "premium_payments_missed": "Missed premiums",
          "max_similarity": "Similarity to earlier claim"}


def drivers_chart(lr_pipeline, path: Path) -> None:
    coefs = lr_pipeline.named_steps["lr"].coef_[0][: len(NUM)]
    order = np.argsort(coefs)
    fig, ax = plt.subplots(figsize=(8, 4.6), dpi=150)
    bg = "#f2eee3"; fig.patch.set_facecolor(bg); ax.set_facecolor(bg)
    colors = ["#d2492a" if c > 0 else "#9fb8b4" for c in coefs[order]]
    ax.barh([PRETTY[NUM[i]] for i in order], coefs[order], color=colors, height=0.6)
    ax.axvline(0, color="#1d2924", lw=1)
    ax.set_title("What raises a fraud score", loc="left", fontsize=13, color="#1d2924", pad=12)
    ax.set_xlabel("Effect on log-odds per standard deviation (red raises risk)", color="#5d6862", fontsize=9)
    ax.tick_params(colors="#1d2924", labelsize=9)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color("#cfc7b3")
    fig.tight_layout(); fig.savefig(path, facecolor=bg); plt.close(fig)


def main() -> None:
    DATA = REAL if REAL.exists() else SYNTH
    if not DATA.exists():
        raise SystemExit("No training data. After demo-reset run: python data/build_fraud_features.py")
    df = pd.read_csv(DATA)
    missing = [c for c in NUM + CAT + ["is_fraud"] if c not in df.columns]
    if missing:
        raise SystemExit(f"{DATA.name} is missing columns {missing}. Run: python data/build_fraud_features.py")
    print(f"Training on {DATA.name}")
    X, y = df[NUM + CAT], df["is_fraud"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)
    print(f"Loaded {len(df)} claims, {y.mean():.1%} fraud. Train {len(X_tr)}, test {len(X_te)}")

    lr = Pipeline([
        ("pre", ColumnTransformer([("num", Pipeline([("log", FunctionTransformer(log_scale)), ("z", StandardScaler())]), NUM),
                                   ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])),
        ("lr", LogisticRegression(max_iter=3000, class_weight="balanced")),
    ]).fit(X_tr, y_tr)
    p = lr.predict_proba(X_te)[:, 1]

    hgb = Pipeline([
        ("pre", ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CAT)])),
        ("hgb", HistGradientBoostingClassifier(random_state=SEED)),
    ]).fit(X_tr, y_tr)
    p_hgb = hgb.predict_proba(X_te)[:, 1]

    hi, mid = p >= 0.7, p >= 0.4
    m = {
        "model": "logistic_regression_balanced", "explainable": True,
        "roc_auc": round(roc_auc_score(y_te, p), 3),
        "pr_auc": round(average_precision_score(y_te, p), 3),
        "precision_at_high": round(precision_score(y_te, hi), 3),
        "recall_at_high": round(recall_score(y_te, hi), 3),
        "recall_at_medium_or_high": round(recall_score(y_te, mid), 3),
        "genuine_flagged_high_pct": round(float(hi[y_te.values == 0].mean()), 3),
        "baseline_model": "hist_gradient_boosting (black box)", "baseline_roc_auc": round(roc_auc_score(y_te, p_hgb), 3),
        "fraud_rate": round(float(y.mean()), 3), "test_size": len(X_te),
        "coefficients": {k: round(float(c), 3) for k, c in zip(NUM, lr.named_steps["lr"].coef_[0][: len(NUM)])},
    }

    (ROOT / "models").mkdir(exist_ok=True); (ROOT / "reports").mkdir(exist_ok=True)
    joblib.dump({"pipeline": lr, "version": datetime.now().strftime("fraud-lr-%Y%m%d")}, ROOT / "models" / "fraud_lr.joblib", compress=3)
    drivers_chart(lr, ROOT / "reports" / "fraud_drivers.png")
    path = ROOT / "reports" / "metrics.json"
    metrics = json.loads(path.read_text()) if path.exists() else {}
    metrics["fraud"] = m
    path.write_text(json.dumps(metrics, indent=2))

    print(f"Logistic regression  ROC-AUC {m['roc_auc']:.3f}  (gradient boosting {m['baseline_roc_auc']:.3f})")
    print(f"At the 0.7 'high risk' line: catches {m['recall_at_high']:.0%} of fraud, "
          f"{m['precision_at_high']:.0%} of flags are real fraud, {m['genuine_flagged_high_pct']:.1%} of genuine claims flagged")
    print(f"Medium or high catches {m['recall_at_medium_or_high']:.0%} of fraud")


if __name__ == "__main__":
    main()
