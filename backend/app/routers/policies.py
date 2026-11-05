from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from ..db_mysql import get_conn
from ..errors import ApiError
from ..security import current_user

router = APIRouter(tags=["policies"])


class PaymentReq(BaseModel):
    amount: float = Field(gt=0)
    mode: Literal["UPI", "CARD", "NETBANKING", "CASH"] = "UPI"


def _scope(user: dict) -> tuple[str, dict]:
    """WHERE clause restricting policies to what this role may see."""
    if user["role"] == "customer":
        return "customer_id = :me", {"me": user["customer_id"]}
    if user["role"] == "agent":
        return "agent_id = :me", {"me": user["agent_id"]}
    return "1=1", {}


def _load(conn, policy_id: int, user: dict) -> dict:
    where, params = _scope(user)
    row = conn.execute(text(f"SELECT * FROM v_policy_summary WHERE policy_id = :p AND {where}"),
                       {"p": policy_id, **params}).mappings().first()
    if not row:
        raise ApiError(404, "POLICY_NOT_FOUND", "Policy not found")
    return dict(row)


@router.get("/policy-types")
def list_policy_types(user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text("SELECT type_id, type_name, coverage_desc, base_premium FROM POLICY_TYPE ORDER BY type_id")).mappings().all()
    return [{**r, "base_premium": float(r["base_premium"])} for r in rows]


@router.get("/policies")
def list_policies(user: dict = Depends(current_user)):
    where, params = _scope(user)
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text(
            f"SELECT * FROM v_policy_summary WHERE {where} ORDER BY (status = 'active') DESC, policy_id DESC LIMIT 200"),
            params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/policies/{policy_id}")
def policy_detail(policy_id: int, user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        p = _load(conn, policy_id, user)
        p["coverage_desc"] = conn.execute(text("SELECT coverage_desc FROM POLICY_TYPE WHERE type_id = :t"),
                                          {"t": p["type_id"]}).scalar()
        p["payments"] = [dict(r) for r in conn.execute(text(
            "SELECT payment_no, amount, pay_date, mode, status FROM PREMIUM_PAYMENT WHERE policy_id = :p "
            "ORDER BY pay_date DESC, payment_no DESC"), {"p": policy_id}).mappings()]
        p["claims"] = [dict(r) for r in conn.execute(text(
            "SELECT claim_id, category, status, claimed_amount, filed_date, fraud_score FROM v_claim_dashboard "
            "WHERE policy_id = :p ORDER BY claim_id DESC"), {"p": policy_id}).mappings()]
    return p


@router.post("/policies/{policy_id}/payments", status_code=201)
def pay_premium(policy_id: int, req: PaymentReq, user: dict = Depends(current_user)):
    if user["role"] not in ("customer", "agent", "admin"):
        raise ApiError(403, "FORBIDDEN", "Adjusters cannot record payments")
    with get_conn(user["email"]) as conn:
        _load(conn, policy_id, user)
        conn.execute(text(  # payment_no is set by trg_payment_no (1, 2, 3... per policy)
            "INSERT INTO PREMIUM_PAYMENT (policy_id, payment_no, amount, pay_date, mode, status) "
            "VALUES (:p, 0, :a, CURDATE(), :m, 'success')"), {"p": policy_id, "a": req.amount, "m": req.mode})
        row = conn.execute(text(
            "SELECT payment_no, amount, pay_date, mode, status FROM PREMIUM_PAYMENT WHERE policy_id = :p "
            "ORDER BY payment_no DESC LIMIT 1"), {"p": policy_id}).mappings().first()
    return {"policy_id": policy_id, **dict(row)}
