from fastapi import APIRouter, Depends
from sqlalchemy import text
from ..db_mysql import get_conn
from ..errors import ApiError
from ..security import current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def my_notifications(user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        rows = conn.execute(text(
            "SELECT notif_id, claim_id, message, is_read, created_at FROM NOTIFICATION "
            "WHERE user_id = :u ORDER BY created_at DESC, notif_id DESC LIMIT 50"), {"u": user["user_id"]}).mappings().all()
    return [{**r, "is_read": bool(r["is_read"])} for r in rows]


@router.put("/{notif_id}/read")
def mark_read(notif_id: int, user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        n = conn.execute(text("UPDATE NOTIFICATION SET is_read = TRUE WHERE notif_id = :n AND user_id = :u"),
                         {"n": notif_id, "u": user["user_id"]}).rowcount
    if not n:
        raise ApiError(404, "NOT_FOUND", "Notification not found")
    return {"notif_id": notif_id, "is_read": True}
