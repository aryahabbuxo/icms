# ICMS — Insurance Claim Management System with NLP

DBMS (CD252IA) · RV College of Engineering

| Folder | Owner | What |
| --- | --- | --- |
| `frontend/` | B | React + Vite + Tailwind UI |
| `ml/` | B | `icms_ml` Python package (NLP, fraud, OCR, NL-to-SQL) |
| `db/`, `backend/` | A | MySQL scripts, FastAPI server (A adds these) |

## Frontend
```bash
cd frontend
npm install
cp .env.example .env      # VITE_USE_MOCKS=true until A's API is live
npm run dev               # http://localhost:5173
```
Demo logins (password `Demo@123`): priya@demo.in, ramesh@demo.in, kavitha@demo.in, admin@demo.in, suresh@demo.in.
Switch to the real backend: set `VITE_USE_MOCKS=false` in `frontend/.env` and restart `npm run dev`.

## ML package
```bash
cd ml
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .                                     # stubs need nothing else
python test_contract.py                              # must print: icms_ml contract OK
pip install -r requirements.txt                      # real models (Saturday)
python -m spacy download en_core_web_sm
```

## Narrative data (B, for A's seed and for training)
```bash
cd ml/data
python generate_narratives.py          # writes narratives.csv: 6,000 rows (text, category, urgency, entities)
```
In Python (A's `seed.py`):
```python
import sys; sys.path.append("ml/data")
from generate_narratives import generate, paraphrase
row = generate("accident")             # {"text", "category", "urgency", "entities"}
dup = paraphrase(row["text"])           # reworded copy for planting duplicate fraud
```
Stage-ready English, Kannada and Hindi narratives: `ml/data/demo_narratives.md`.

## Train the claim classifier (B)
```bash
cd ml
pip install scikit-learn pandas joblib matplotlib
python train_classifier.py        # ~30 s; writes models/*.joblib and reports/metrics.json + confusion matrix
python test_contract.py           # must still print: icms_ml contract OK
```
Kannada/Hindi translation uses Gemini when `LLM_API_KEY` is set (free key: aistudio.google.com).
Without a key, a keyword fallback still classifies those narratives (confidence 0.5).
