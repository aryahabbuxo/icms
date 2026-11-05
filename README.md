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

## Train the models (B)
```bash
cd ml
pip install -e .                      # installs scikit-learn, pandas, numpy, joblib
pip install spacy matplotlib
python -m spacy download en_core_web_sm
python train_classifier.py            # category + urgency   (~30 s)
python data/generate_fraud_data.py    # labelled claims (replace with A's export later)
python train_fraud.py                 # explainable fraud model (~2 s)
python train_embedder.py              # duplicate detector + threshold (~15 s)
python test_contract.py               # must print: icms_ml contract OK
```
All trained models are committed in `ml/models/`, so A never has to train. Results land in `ml/reports/metrics.json`
and three report-ready charts in `ml/reports/`.

Kannada/Hindi translation uses Gemini when `LLM_API_KEY` is set (free key: aistudio.google.com).
Without a key, a keyword fallback still classifies those narratives (confidence 0.5).

## OCR (bill / FIR images)
Install the Tesseract program once:
- Windows: installer from https://github.com/UB-Mannheim/tesseract/wiki , then set
  `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in the backend's `.env`
- Mac: `brew install tesseract`
Then `pip install pytesseract pillow`. Without Tesseract, `ocr()` returns "" and uploads still work.
A ready-made demo bill for the upload step: `ml/data/demo_bill.png` (total Rs 85,000).

## Mock mode vs real backend
`frontend/.env`: `VITE_USE_MOCKS=true` runs the whole demo in the browser (no database needed).
Set it to `false` once A's FastAPI server is running on port 8000.

## Run the full system (real database + backend)
Docker Desktop must be running ("Engine running"). From the `icms` folder, in PowerShell:
```
ml\.venv\Scripts\activate                  # one Python environment for ML, seed and backend
pip install -r backend\requirements.txt -r db\seed\requirements.txt
docker compose up -d                          # MySQL 8 + MongoDB
.\demo-reset.ps1                              # schema, triggers, procedures, views, seed (~90 s)
cd backend
uvicorn app.main:app --reload --port 8000     # API docs: http://localhost:8000/docs
```
In a second terminal: set `VITE_USE_MOCKS=false` in `frontend\.env`, then `cd frontend` and `npm run dev`.
Run `.\demo-reset.ps1` again before every rehearsal and before the demo; it restores every demo fixture.
