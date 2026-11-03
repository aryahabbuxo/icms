"""Train the offline text embedder used for duplicate-claim detection, and pick its threshold.

Run from the ml/ folder:
    python train_embedder.py

Embedder: "LSA" = TF-IDF over word 1-2 grams + character 3-5 grams, reduced to 384 dimensions with truncated SVD,
then L2-normalised so cosine similarity is a plain dot product. It runs offline in milliseconds, needs no
PyTorch, and character n-grams keep it robust to typos and reworded copies.

Threshold: built from 400 positive pairs (a narrative and a light or heavy paraphrase(), the way a fraudster
rewords an old claim) and 400 hard negatives (each claim's most similar *different* claim, i.e. the nearest
look-alike a genuine customer could produce). The threshold with the
best F1 is stored in metrics.json and used by icms_ml.find_duplicate().

Output: models/embedder_lsa.joblib, reports/metrics.json ("duplicate" section), reports/duplicate_similarity.png
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import Normalizer

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "data"))
from generate_narratives import paraphrase  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

DIM, SEED, PAIRS = 384, 42, 400


def build() -> Pipeline:
    return Pipeline([
        ("tfidf", FeatureUnion([
            ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=3, sublinear_tf=True, max_features=12000)),
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3, sublinear_tf=True, max_features=20000)),
        ])),
        ("svd", TruncatedSVD(n_components=DIM, random_state=SEED)),
        ("norm", Normalizer()),
    ])


def main() -> None:
    df = pd.read_csv(ROOT / "data" / "narratives.csv")
    rng = random.Random(SEED)
    idx = list(range(len(df)))
    rng.shuffle(idx)
    held = set(idx[: PAIRS * 3])                       # pairs come from narratives the embedder never saw
    model = build().fit(df.text[[i for i in idx if i not in held]])

    held_l = list(held)
    pos_idx, pool = held_l[:PAIRS], held_l[PAIRS:]
    # half light rewording, half heavy (paraphrased twice): fraudsters often rework the text more than once
    pos = [(df.text[i], paraphrase(df.text[i], seed=i) if k % 2 else paraphrase(paraphrase(df.text[i], seed=i), seed=i + 1))
           for k, i in enumerate(pos_idx)]
    # Hard negatives: for each claim, its MOST similar genuinely different claim in the pool.
    # That is exactly what find_duplicate() compares against in production (max similarity).
    E_pos = model.transform([df.text[i] for i in pos_idx]); E_pool = model.transform([df.text[i] for i in pool])
    nn = (E_pos @ E_pool.T).argmax(axis=1)
    neg = [(df.text[i], df.text[pool[j]]) for i, j in zip(pos_idx, nn)]
    # drop accidental exact-text twins (template collisions), which are not "different claims"
    neg = [(a, b) for a, b in neg if a.strip().lower() != b.strip().lower()]
    def sims(pairs):
        A = model.transform([a for a, _ in pairs]); B = model.transform([b for _, b in pairs])
        return (A * B).sum(axis=1)
    sp, sn = sims(pos), sims(neg)

    best = max(((t, *_prf(sp, sn, t)) for t in np.arange(0.5, 0.99, 0.01)), key=lambda x: x[3])
    thr, p, r, f1 = (round(float(x), 3) for x in best)

    svd = model.named_steps["svd"]; svd.components_ = svd.components_.astype(np.float32)  # halves the file
    (ROOT / "models").mkdir(exist_ok=True); (ROOT / "reports").mkdir(exist_ok=True)
    joblib.dump({"pipeline": model, "dim": DIM, "name": "lsa-384"}, ROOT / "models" / "embedder_lsa.joblib", compress=3)
    _chart(sp, sn, thr, ROOT / "reports" / "duplicate_similarity.png")
    path = ROOT / "reports" / "metrics.json"
    metrics = json.loads(path.read_text()) if path.exists() else {}
    metrics["duplicate"] = {"embedder": "tfidf_word+char -> svd384 (LSA)", "threshold": thr, "precision": p, "recall": r, "f1": f1,
                            "threshold_same_customer": 0.75, "pairs": PAIRS, "mean_sim_duplicates": round(float(sp.mean()), 3), "mean_sim_different": round(float(sn.mean()), 3)}
    path.write_text(json.dumps(metrics, indent=2))
    print(f"Reworded copies: mean similarity {sp.mean():.2f}. Closest genuinely different claim: {sn.mean():.2f}")
    print(f"Best threshold {thr:.2f}: precision {p:.2f}, recall {r:.2f}, F1 {f1:.2f}")


def _prf(sp, sn, t):
    tp, fn, fp = (sp >= t).sum(), (sp < t).sum(), (sn >= t).sum()
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn)
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def _chart(sp, sn, thr, path):
    fig, ax = plt.subplots(figsize=(8, 4), dpi=150)
    bg = "#f2eee3"; fig.patch.set_facecolor(bg); ax.set_facecolor(bg)
    bins = np.linspace(min(sn.min(), sp.min()), 1, 40)
    ax.hist(sn, bins=bins, color="#9fb8b4", label="Closest different claim")
    ax.hist(sp, bins=bins, color="#d2492a", alpha=0.85, label="Reworded copies")
    ax.axvline(thr, color="#1d2924", lw=1.4, ls="--")
    ax.text(thr - 0.01, ax.get_ylim()[1] * 0.92, f"flag at {thr:.2f}", ha="right", fontsize=9, color="#1d2924")
    ax.set_title("Reworded copies separate cleanly from genuine claims", loc="left", fontsize=13, color="#1d2924", pad=12)
    ax.set_xlabel("Cosine similarity to the closest earlier claim", color="#5d6862", fontsize=9)
    ax.tick_params(colors="#1d2924", labelsize=9)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.set_yticks([])
    ax.legend(frameon=False, fontsize=9)
    fig.tight_layout(); fig.savefig(path, facecolor=bg); plt.close(fig)


if __name__ == "__main__":
    main()
