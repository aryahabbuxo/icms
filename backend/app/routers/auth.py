import re
from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from ..db_mysql import get_conn
from ..errors import ApiError
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

USER_SQL = """
SELECT u.user_id, u.email, u.password_hash, u.role, u.customer_id, u.agent_id, u.adjuster_id, u.is_active,
       COALESCE(c.name, a.name, j.name, 'Admin') AS name, COALESCE(j.is_senior, 0) AS is_senior
FROM APP_USER u
LEFT JOIN CUSTOMER c ON c.customer_id = u.customer_id
LEFT JOIN AGENT a ON a.agent_id = u.agent_id
LEFT JOIN ADJUSTER j ON j.adjuster_id = u.adjuster_id
"""


class LoginReq(BaseModel):
    email: str
    password: str


class RegisterReq(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    dob: date
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=72)
    address: str = Field(min_length=3, max_length=255)
    city: str = Field(min_length=2, max_length=60)
    phone: str = Field(pattern=r"^[6-9][0-9]{9}$")


def public_user(row) -> dict:
    return {"user_id": row["user_id"], "role": row["role"], "name": row["name"], "email": row["email"],
            "customer_id": row["customer_id"], "agent_id": row["agent_id"], "adjuster_id": row["adjuster_id"],
            "is_senior": bool(row["is_senior"])}


@router.post("/login")
def login(req: LoginReq):
    with get_conn(req.email) as conn:
        row = conn.execute(text(USER_SQL + " WHERE u.email = :e"), {"e": req.email.strip().lower()}).mappings().first()
    if not row or not row["is_active"] or not verify_password(req.password, row["password_hash"]):
        raise ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password")
    user = public_user(row)
    return {"token": create_token(user), "user": user}


@router.post("/register", status_code=201)
def register(req: RegisterReq):
    email = req.email.strip().lower()
    with get_conn(email) as conn:
        cid = conn.execute(
            text("INSERT INTO CUSTOMER (name,dob,email,address,city) VALUES (:n,:d,:e,:a,:c)"),
            {"n": req.name, "d": req.dob, "e": email, "a": req.address, "c": req.city}).lastrowid
        conn.execute(text("INSERT INTO CUSTOMER_PHONE (customer_id,phone) VALUES (:c,:p)"), {"c": cid, "p": req.phone})
        uid = conn.execute(
            text("INSERT INTO APP_USER (email,password_hash,role,customer_id) VALUES (:e,:h,'customer',:c)"),
            {"e": email, "h": hash_password(req.password), "c": cid}).lastrowid
    user = {"user_id": uid, "role": "customer", "name": req.name, "email": email,
            "customer_id": cid, "agent_id": None, "adjuster_id": None}
    return {"token": create_token(user), "user": user}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    with get_conn(user["email"]) as conn:
        row = conn.execute(text(USER_SQL + " WHERE u.user_id = :i"), {"i": user["user_id"]}).mappings().first()
    if not row or not row["is_active"]:
        raise ApiError(401, "INVALID_TOKEN", "User no longer exists")
    return public_user(row)
