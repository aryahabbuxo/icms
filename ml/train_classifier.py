"""Train the claim classifiers (category + urgency) and write their metrics.

Run from the ml/ folder:
    python train_classifier.py

Produces
    models/category_clf.joblib      TF-IDF (words + characters) -> Logistic Regression
    models/urgency_clf.joblib       same pipeline, urgency labels
    reports/metrics.json            precision / recall / F1 on a held-out test set, plus baselines
    reports/confusion_matrix_category.png

Method (say this in the viva)
    * 70 / 15 / 15 stratified split, random_state=42. C is tuned on the validation set only;
      the test set is touched exactly once, for the final numbers.
    * Character n-grams (3-5) make the model robust to typos and broken English.
    * Baselines: unigram Naive Bayes for category, majority class for urgency.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import joblib
import matplotlib
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import ConfusionMatrixDisplay, f1_score, precision_recall_fscore_support, recall_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "narratives.csv"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
SEED = 42


def make_pipeline(C: float) -> Pipeline:
    features = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True, max_features=40000)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True, max_features=60000)),
    ])
    return Pipeline([("tfidf", features),
                     ("clf", LogisticRegression(max_iter=3000, class_weight="balanced", C=C))])


def train_one(df: pd.DataFrame, target: str, baseline) -> tuple[Pipeline, dict, tuple]:
    X_tmp, X_te, y_tmp, y_te = train_test_split(df.text, df[target], test_size=0.15, stratify=df[target], random_state=SEED)
    X_tr, X_va, y_tr, y_va = train_test_split(X_tmp, y_tmp, test_size=0.15 / 0.85, stratify=y_tmp, random_state=SEED)

    best_C, best_f1 = None, -1.0
    for C in (1, 2, 4, 8, 16):
        f1 = f1_score(y_va, make_pipeline(C).fit(X_tr, y_tr).predict(X_va), average="macro")
        print(f"  {target}: C={C:<3} validation macro-F1 = {f1:.3f}")
        if f1 > best_f1:
            best_C, best_f1 = C, f1

    model = make_pipeline(best_C).fit(X_tr, y_tr)
    pred = model.predict(X_te)
    p, r, f, _ = precision_recall_fscore_support(y_te, pred, average="macro", zero_division=0)
    labels = sorted(df[target].unique())
    pc = precision_recall_fscore_support(y_te, pred, labels=labels, zero_division=0)
    base_pred = baseline.fit(X_tr, y_tr).predict(X_te)

    metrics = {
        "model": "tfidf_word+char_logreg", "C": best_C,
        "precision": round(p, 3), "recall": round(r, 3), "f1": round(f, 3),
        "baseline_f1": round(f1_score(y_te, base_pred, average="macro", zero_division=0), 3),
        "per_class": {lab: {"p": round(pc[0][i], 3), "r": round(pc[1][i], 3), "f1": round(pc[2][i], 3), "n": int(pc[3][i])}
                      for i, lab in enumerate(labels)},
        "train_size": len(X_tr), "val_size": len(X_va), "test_size": len(X_te),
    }
    if target == "urgency":
        metrics["critical_recall"] = round(recall_score(y_te, pred, labels=["critical"], average="macro"), 3)
    return model, metrics, (y_te, pred, labels)


def save_confusion(y_true, y_pred, labels, path: Path) -> None:
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list("icms", ["#f2eee3", "#d3e6e3", "#1d2924"])
    fig, ax = plt.subplots(figsize=(8, 7), dpi=150)
    fig.patch.set_facecolor("#f2eee3")
    disp = ConfusionMatrixDisplay.from_predictions(y_true, y_pred, labels=labels, cmap=cmap, colorbar=False, ax=ax,
                                                   display_labels=[l.replace("_", " ") for l in labels])
    cm = disp.confusion_matrix
    for (i, j), t in zip(((i, j) for i in range(cm.shape[0]) for j in range(cm.shape[1])), disp.text_.ravel()):
        t.set_fontsize(9)
        t.set_color("#f2eee3" if cm[i, j] > 0.75 * cm.max() else "#1d2924")  # readable on every shade
    ax.set_title("Claim category: held-out test set", fontsize=13, color="#1d2924", pad=14, loc="left")
    ax.set_xlabel("Predicted", color="#5d6862"); ax.set_ylabel("Actual", color="#5d6862")
    ax.tick_params(colors="#1d2924", labelsize=9)
    plt.setp(ax.get_xticklabels(), rotation=35, ha="right")
    for s in ax.spines.values():
        s.set_visible(False)
    fig.tight_layout()
    fig.savefig(path, facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    if not DATA.exists():
        raise SystemExit(f"{DATA} not found. Run: python data/generate_narratives.py")
    MODELS.mkdir(exist_ok=True); REPORTS.mkdir(exist_ok=True)
    df = pd.read_csv(DATA)
    print(f"Loaded {len(df)} narratives")

    print("Category model")
    cat_model, cat_m, (yt, yp, labs) = train_one(df, "category",
        Pipeline([("bow", CountVectorizer()), ("nb", MultinomialNB())]))
    print("Urgency model")
    urg_model, urg_m, _ = train_one(df, "urgency", DummyClassifier(strategy="most_frequent"))

    joblib.dump(cat_model, MODELS / "category_clf.joblib", compress=3)
    joblib.dump(urg_model, MODELS / "urgency_clf.joblib", compress=3)
    save_confusion(yt, yp, labs, REPORTS / "confusion_matrix_category.png")

    path = REPORTS / "metrics.json"
    metrics = json.loads(path.read_text()) if path.exists() else {}   # keep fraud/duplicate sections from other scripts
    metrics.update({"category": cat_m, "urgency": urg_m, "test_size": cat_m["test_size"],
                    "trained_at": datetime.now().isoformat(timespec="seconds")})
    path.write_text(json.dumps(metrics, indent=2))

    print(f"\nCategory  test macro-F1 {cat_m['f1']:.3f}  (Naive Bayes baseline {cat_m['baseline_f1']:.3f})")
    print(f"Urgency   test macro-F1 {urg_m['f1']:.3f}  (majority baseline {urg_m['baseline_f1']:.3f}), critical recall {urg_m['critical_recall']:.3f}")
    print(f"Saved models to {MODELS} and metrics to {path}")


if __name__ == "__main__":
    main()
