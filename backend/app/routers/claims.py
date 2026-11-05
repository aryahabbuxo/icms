import json
from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from .. import db_mongo
from ..db_mysql import get_conn
from ..errors import ApiError
from .. import ml
from ..pipeline import file_claim, mongo_try, safe
from ..security import current_user, require_role

router = APIRouter(prefix="/claims", tags=["claims"])


class ClaimReq(BaseModel):
    policy_id: int
    incident_date: date
    claimed_amount: float = Field(gt=0)
    narrative: str = Field(min_length=10, max_length=5000)
    language: Literal["en", "kn", "hi"] = "en"


class AssessReq(BaseModel):
    decision: Literal["approve", "reject", "request_info"]
    approved_amount: float = Field(default=0, ge=0)
    remarks: Optional[str] = Field(default=None, max_length=1000)


class SettleReq(BaseModel):
    amount: float = Field(gt=0)
    mode: Literal["NEFT", "UPI", "CHEQUE"] = "NEFT"


class AssignReq(BaseModel):
    adjuster_id: int


def load_claim(conn, claim_id: int, user: dict) -> dict:
    """Fetch a claim and enforce role scoping. Adjusters may open any claim (senior re-review)."""
    row = conn.execute(text(
        "SELECT c.*, p.customer_id AS _cust, p.agent_id AS _agent FROM CLAIM c "
        "JOIN POLICY p ON p.policy_id = c.policy_id WHERE c.claim_id = :i"), {"i": claim_id}).mappings().first()
    if not row:
        raise ApiError(404, "CLAIM_NOT_FOUND", "Claim not found")
    r, ok = user["role"], False
    ok = (r in ("admin", "adjuster")
          or (r == "customer" and row["_cust"] == user.get("customer_id"))
          or (r == "agent" and row["_agent"] == user.get("agent_id")))
    if not ok:
        raise ApiError(404, "CLAIM_NOT_FOUND", "Claim not found")
    return dict(row)


def notify(conn, user_id, claim_id, message):
    if user_id:
        conn.execute(text("INSERT INTO NOTIFICATION (user_id, claim_id, message) VALUES (:u,:c,:m)"),
                     {"u": user_id, "c": claim_id, "m": message})


def customer_user_id(conn, claim_id):
    return conn.execute(text(
        "SELECT u.user_id FROM APP_USER u JOIN POLICY p ON p.customer_id = u.customer_id "
        "JOIN CLAIM c ON c.policy_id = p.policy_id WHERE c.claim_id = :c"), {"c": claim_id}).scalar()


@router.post("", status_code=201)
def create_claim(req: ClaimReq, user: dict = Depends(require_role("customer"))):
    return file_claim(user, req)


@router.get("")
def list_claims(status: Optional[str] = None, category: Optional[str] = None,
                min_fraud: Optional[float] = Query(default=None, ge=0, le=1),
                limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                user: dict = Depends(current_user)):
    where, params = ["1=1"], {"lim": limit, "off": offset}
    role = user["role"]
    if role == "customer":
        where.append("customer_id = :me"); params["me"] = user["customer_id"]
    elif role == "adjuster":
        where.append("adjuster_id = :me"); params["me"] = user["adjuster_id"]
    elif role == "agent":
        where.append("policy_id IN (SELECT policy_id FROM POLICY WHERE agent_id = :me)"); params["me"] = user["agent_id"]
    if status:
        where.append("status = :status"); params["status"] = status
    if category:
        where.append("category = :category"); params["category"] = category
    if min_fraud is not None:
        where.append("fraud_score >= :mf"); params["mf"] = min_fraud
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text(
            f"SELECT d.*, (SELECT MAX(a.approved_amount) FROM ASSESSMENT a WHERE a.claim_id = d.claim_id "
            f"AND a.decision = 'approve') AS approved_amount FROM v_claim_dashboard d "
            f"WHERE {' AND '.join(where)} ORDER BY claim_id DESC LIMIT :lim OFFSET :off"),
            params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{claim_id}")
def claim_detail(claim_id: int, user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        c = load_claim(conn, claim_id, user)
        c.pop("_cust"); c.pop("_agent")
        if isinstance(c.get("fraud_reasons"), str):
            c["fraud_reasons"] = json.loads(c["fraud_reasons"])
        policy = conn.execute(text("SELECT * FROM v_policy_summary WHERE policy_id = :p"), {"p": c["policy_id"]}).mappings().first()
        customer = conn.execute(text(
            "SELECT cu.name, cu.city FROM CUSTOMER cu JOIN POLICY p ON p.customer_id = cu.customer_id WHERE p.policy_id = :p"),
            {"p": c["policy_id"]}).mappings().first()
        assessments = conn.execute(text(
            "SELECT a.*, j.name AS adjuster_name FROM ASSESSMENT a JOIN ADJUSTER j ON j.adjuster_id = a.adjuster_id "
            "WHERE a.claim_id = :c ORDER BY a.review_date"), {"c": claim_id}).mappings().all()
        settlement = conn.execute(text("SELECT * FROM SETTLEMENT WHERE claim_id = :c"), {"c": claim_id}).mappings().first()
        adjuster_name = conn.execute(text("SELECT name FROM ADJUSTER WHERE adjuster_id = :a"),
                                     {"a": c.get("assigned_adjuster_id")}).scalar()
        timeline = conn.execute(text(
            "SELECT log_no, old_status, new_status, changed_at, changed_by, curr_hash FROM CLAIM_STATUS_LOG WHERE claim_id = :c ORDER BY log_no"),
            {"c": claim_id}).mappings().all()
    narrative = mongo_try(lambda: db_mongo.narratives.find_one({"claim_id": claim_id}, {"_id": 0, "embedding": 0}), None, "narrative")
    docs = mongo_try(lambda: list(db_mongo.documents.find({"claim_id": claim_id}, {"_id": 0, "gridfs_id": 0})), [], "documents")
    fx = mongo_try(lambda: db_mongo.fraud_explanations.find_one({"claim_id": claim_id}, {"_id": 0}, sort=[("scored_at", -1)]), None, "fraud")
    score = float(c["fraud_score"]) if c.get("fraud_score") is not None else 0.0
    fraud = {"score": score, "level": "high" if score >= 0.7 else "medium" if score >= 0.4 else "low",
             "reasons": (fx or {}).get("top_reasons") or c.get("fraud_reasons") or []}
    if not narrative:  # seeded claim without a Mongo document: fall back to the SQL summary
        narrative = {"original_text": c.get("description_summary") or "", "language": "en",
                     "nlp": {"category": c.get("category"), "urgency": c.get("urgency"),
                             "confidence": float(c["nlp_confidence"]) if c.get("nlp_confidence") is not None else None,
                             "entities": []}}
    sim = next((float(r.get("value", 0)) for r in fraud["reasons"] if r.get("feature") == "max_similarity"),
               ((fx or {}).get("features") or {}).get("max_similarity", 0.0))
    duplicate = {"is_duplicate": c.get("duplicate_of") is not None, "similar_claim_id": c.get("duplicate_of"),
                 "similarity": round(float(sim or 0.0), 3)}
    return {**c, "adjuster_name": adjuster_name, "policy": dict(policy) if policy else None,
            "customer": dict(customer) if customer else None,
            "narrative": narrative, "documents": docs, "fraud": fraud, "duplicate": duplicate,
            "assessments": [dict(a) for a in assessments], "settlement": dict(settlement) if settlement else None,
            "timeline": [dict(t) for t in timeline]}


@router.get("/{claim_id}/timeline")
def claim_timeline(claim_id: int, user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
        rows = conn.execute(text("SELECT * FROM CLAIM_STATUS_LOG WHERE claim_id = :c ORDER BY log_no"), {"c": claim_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{claim_id}/verify-chain")
def verify_chain(claim_id: int, user: dict = Depends(require_role("admin"))):
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
        rows = conn.execute(text("CALL sp_verify_audit_chain(:c)"), {"c": claim_id}).mappings().all()
    out, broken = [], None
    for r in rows:
        ok = r["stored_hash"] == r["recomputed_hash"] and bool(r["link_ok"])
        item = {"log_no": r["log_no"], "old_status": r["old_status"], "new_status": r["new_status"], "ok": ok,
                "changed_at": r.get("changed_at"), "changed_by": r.get("changed_by")}
        if not ok:
            item.update(stored_hash=r["stored_hash"], recomputed_hash=r["recomputed_hash"])
            broken = broken if broken is not None else r["log_no"]
        out.append(item)
    return {"claim_id": claim_id, "valid": broken is None, "checked": len(out), "broken_at_log_no": broken, "rows": out}


@router.post("/{claim_id}/assess")
def assess(claim_id: int, req: AssessReq, user: dict = Depends(require_role("adjuster"))):
    if req.decision == "approve" and req.approved_amount <= 0:
        raise ApiError(422, "AMOUNT_REQUIRED", "Approved amount must be greater than zero when approving")
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
        conn.execute(text(
            "INSERT INTO ASSESSMENT (claim_id, adjuster_id, decision, approved_amount, remarks) VALUES (:c,:a,:d,:m,:r)"),
            {"c": claim_id, "a": user["adjuster_id"], "d": req.decision, "m": req.approved_amount, "r": req.remarks})
        status = conn.execute(text("SELECT status FROM CLAIM WHERE claim_id = :c"), {"c": claim_id}).scalar()
        notify(conn, customer_user_id(conn, claim_id), claim_id, f"Claim #{claim_id} is now {status.replace('_', ' ')}.")
    return {"claim_id": claim_id, "status": status}


@router.post("/{claim_id}/settle")
def settle(claim_id: int, req: SettleReq, user: dict = Depends(require_role("admin"))):
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
        conn.execute(text("CALL sp_settle_claim(:c, :a, :m, @sid)"), {"c": claim_id, "a": req.amount, "m": req.mode})
        sid = conn.execute(text("SELECT @sid")).scalar()
        notify(conn, customer_user_id(conn, claim_id), claim_id, f"Claim #{claim_id} settled: Rs {req.amount:,.0f} via {req.mode}.")
    return {"claim_id": claim_id, "settlement_id": sid, "status": "settled"}


@router.put("/{claim_id}/assign")
def assign(claim_id: int, req: AssignReq, user: dict = Depends(require_role("admin"))):
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
        conn.execute(text("UPDATE CLAIM SET assigned_adjuster_id = :a WHERE claim_id = :c"), {"a": req.adjuster_id, "c": claim_id})
        au = conn.execute(text("SELECT user_id FROM APP_USER WHERE adjuster_id = :a"), {"a": req.adjuster_id}).scalar()
        notify(conn, au, claim_id, f"Claim #{claim_id} was assigned to you by an admin.")
    return {"claim_id": claim_id, "assigned_adjuster_id": req.adjuster_id}


ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@router.post("/{claim_id}/documents", status_code=201)
async def upload_document(claim_id: int, file: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise ApiError(422, "FILE_TOO_LARGE", "Files must be 5 MB or smaller")
    if file.content_type not in ALLOWED_TYPES:
        raise ApiError(422, "FILE_TYPE", "Upload a JPG, PNG or PDF")
    with get_conn(user["email"]) as conn:
        load_claim(conn, claim_id, user)
    name = file.filename or "document"
    lower = name.lower()
    doc_type = ("fir" if "fir" in lower else "bill" if any(w in lower for w in ("bill", "invoice", "estimate", "receipt"))
                else "photo" if file.content_type.startswith("image/") else "other")
    ocr_text = safe(ml.ocr, "", data, label="ocr") if file.content_type.startswith("image/") else ""
    gid = mongo_try(lambda: db_mongo.fs.put(data, filename=name, content_type=file.content_type, claim_id=claim_id),
                    None, "gridfs")
    doc = {"claim_id": claim_id, "doc_type": doc_type, "filename": name, "gridfs_id": gid,
           "ocr_text": ocr_text, "uploaded_at": __import__("datetime").datetime.now()}
    mongo_try(lambda: db_mongo.documents.insert_one(dict(doc)), None, "save document")
    return {"claim_id": claim_id, "doc_type": doc_type, "filename": name, "ocr_text": ocr_text}
