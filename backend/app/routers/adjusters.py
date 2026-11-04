from fastapi import APIRouter, Depends
from sqlalchemy import text
from ..db_mysql import get_conn
from ..security import require_role

router = APIRouter(prefix="/adjusters", tags=["adjusters"])


@router.get("/queue")
def queue(user: dict = Depends(require_role("adjuster"))):
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text(
            "SELECT * FROM v_claim_dashboard WHERE adjuster_id = :a AND status IN ('under_review','info_requested') "
            "ORDER BY fraud_score DESC, claim_id"), {"a": user["adjuster_id"]}).mappings().all()
    return [dict(r) for r in rows]
