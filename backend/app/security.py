import datetime as dt
import bcrypt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from .config import JWT_SECRET, JWT_ALGORITHM, JWT_HOURS
from .errors import ApiError


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: dict) -> str:
    claims = {k: user.get(k) for k in ("user_id", "email", "role", "customer_id", "agent_id", "adjuster_id")}
    claims["exp"] = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=JWT_HOURS)
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


bearer_scheme = HTTPBearer(auto_error=False)  # makes Swagger show the Authorize button


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict:
    if creds is None or not creds.credentials:
        raise ApiError(401, "NOT_AUTHENTICATED", "Missing bearer token")
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise ApiError(401, "INVALID_TOKEN", "Token is invalid or expired")


def require_role(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if roles and user["role"] not in roles:
            raise ApiError(403, "FORBIDDEN", f"Requires role: {', '.join(roles)}")
        return user
    return dep
