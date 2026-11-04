from contextlib import contextmanager
from sqlalchemy import create_engine, text
from .config import MYSQL_URL, MYSQL_READONLY_URL

engine = create_engine(MYSQL_URL, pool_pre_ping=True)
engine_ro = create_engine(MYSQL_READONLY_URL, pool_pre_ping=True)


@contextmanager
def get_conn(user_email: str | None = None):
    """One transaction per call. Sets @app_user so the audit log records who acted."""
    with engine.begin() as conn:
        conn.execute(text("SET @app_user = :u"), {"u": user_email or "system"})
        yield conn
