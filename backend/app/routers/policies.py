from fastapi import APIRouter, Depends
from sqlalchemy import text
from ..db_mysql import get_conn
from ..security import current_user

router = APIRouter(tags=["policies"])


@router.get("/policy-types")
def list_policy_types(user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text("SELECT type_id, type_name, coverage_desc, base_premium FROM POLICY_TYPE ORDER BY type_id")).mappings().all()
    return [{**r, "base_premium": float(r["base_premium"])} for r in rows]
