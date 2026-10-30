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
