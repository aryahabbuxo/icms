"""Admin-only routes: dashboard stats, plain-English questions (NL-to-SQL) and model metrics."""
import datetime as dt
import decimal
import json
import re
from pathlib import Path
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from .. import db_mongo, ml
from ..db_mysql import engine_ro, get_conn
from ..errors import ApiError
from ..pipeline import mongo_try
from ..security import require_role

router = APIRouter(prefix="/admin", tags=["admin"])
METRICS = Path(__file__).resolve().parents[3] / "ml" / "reports" / "metrics.json"

# Tables and views the read-only user may query (mirrors 06_roles_grants.sql; APP_USER is never exposed).
NLQ_TABLES = ["v_claim_dashboard", "v_adjuster_workload", "v_policy_summary", "CLAIM", "POLICY", "POLICY_TYPE",
              "CUSTOMER", "ADJUSTER", "AGENT", "ASSESSMENT", "SETTLEMENT", "PREMIUM_PAYMENT", "CLAIM_STATUS_LOG"]
FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace|call|load|handler|"
                       r"lock|set|sleep|benchmark|outfile|dumpfile|information_schema|mysql\.|performance_schema|"
                       r"sys\.|app_user|password)\b", re.I)


@router.get("/stats")
def stats(user: dict = Depends(require_role("admin"))):
    with get_conn(user["email"]) as conn:
        q = lambda sql: [dict(r) for r in conn.execute(text(sql)).mappings()]  # noqa: E731
        k = q("""SELECT COUNT(*) AS total_claims,
                        SUM(status IN ('filed','under_review','info_requested')) AS pending,
                        SUM(status IN ('approved','settled')) / NULLIF(SUM(status IN ('approved','settled','rejected')), 0) AS approved_pct,
                        ROUND(AVG(days_to_settle), 1) AS avg_settle_days,
                        SUM(fraud_score >= 0.7 AND status IN ('filed','under_review','info_requested')) AS high_risk
                 FROM v_claim_dashboard""")[0]
        by_cat = q("SELECT category AS label, COUNT(*) AS value FROM CLAIM GROUP BY category ORDER BY value DESC")
        by_month = q("""SELECT DATE_FORMAT(filed_date, '%b') AS month, COUNT(*) AS count FROM CLAIM
                        WHERE filed_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 12 MONTH)
                          AND filed_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')   -- complete months only
                        GROUP BY YEAR(filed_date), MONTH(filed_date), month ORDER BY YEAR(filed_date), MONTH(filed_date)""")
        hist = q("""SELECT LEAST(FLOOR(fraud_score * 10), 9) AS b, COUNT(*) AS count FROM CLAIM
                    WHERE fraud_score IS NOT NULL GROUP BY b ORDER BY b""")
        load = q("SELECT name, open_claims AS open FROM v_adjuster_workload ORDER BY open_claims DESC LIMIT 8")
    counts = {int(h["b"]): int(h["count"]) for h in hist}
    return {
        "kpis": {"total_claims": int(k["total_claims"] or 0), "pending": int(k["pending"] or 0),
                 "approved_pct": float(k["approved_pct"] or 0), "avg_settle_days": float(k["avg_settle_days"] or 0),
                 "high_risk": int(k["high_risk"] or 0)},
        "claims_by_category": [{"label": r["label"] or "other", "value": int(r["value"])} for r in by_cat],
        "claims_by_month": [{"month": r["month"], "count": int(r["count"])} for r in by_month],
        "fraud_histogram": [{"bucket": f"{b / 10:.1f}-{(b + 1) / 10:.1f}".replace("1.0", "1"), "count": counts.get(b, 0)} for b in range(10)],
        "adjuster_workload": [{"name": r["name"], "open": int(r["open"])} for r in load],
    }


class AskReq(BaseModel):
    question: str = Field(min_length=3, max_length=300)


def _schema_text() -> str:
    with engine_ro.connect() as conn:
        rows = conn.execute(text(
            "SELECT TABLE_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION SEPARATOR ', ') AS cols "
            "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME")).all()
    allowed = {t.lower() for t in NLQ_TABLES}
    return "\n".join(f"{t}({c})" for t, c in rows if t.lower() in allowed)


def _safe_select(sql: str) -> str:
    """Layer 2-3 of the NL-to-SQL guard: exactly one SELECT, no writes, no system schemas, no comments."""
    s = sql.strip().rstrip(";").strip()
    if not re.match(r"^(select|with)\b", s, re.I):
        raise ApiError(422, "UNSAFE_QUERY", "Only questions that read data are allowed.")
    if ";" in s or "--" in s or "/*" in s or "#" in s or FORBIDDEN.search(s):
        raise ApiError(422, "UNSAFE_QUERY", "Only questions that read data are allowed. This request would change or expose protected data.")
    return s


def _jsonable(v):
    if isinstance(v, decimal.Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return v


def _chart_hint(columns, rows) -> str:
    if len(columns) == 2 and rows and all(isinstance(r[1], (int, float)) for r in rows):
        return "line" if re.search(r"month|date|week|year|day", columns[0], re.I) else "bar"
    return "table"


@router.post("/nl-query")
def nl_query(req: AskReq, user: dict = Depends(require_role("admin"))):
    q = req.question.strip()
    if FORBIDDEN.search(q) and re.search(r"\b(delete|drop|update|insert|truncate|alter|grant|password)\b", q, re.I):
        raise ApiError(422, "UNSAFE_QUERY", "Only questions that read data are allowed. This request would change or expose protected data.")
    sql, rows, cols, err = None, [], [], None
    try:
        sql = _safe_select(ml.nl_to_sql(q, _schema_text()))
        with engine_ro.connect() as conn:                       # layer 5: read-only MySQL user
            conn.execute(text("SET SESSION MAX_EXECUTION_TIME = 3000"))
            res = conn.execute(text(f"SELECT * FROM ({sql}) AS q LIMIT 200"))  # layer 4: row cap
            cols = list(res.keys())
            rows = [[_jsonable(v) for v in r] for r in res.all()]
    except ApiError as e:
        err = e
    except Exception:  # bad SQL from the model, timeout, missing grant...
        err = ApiError(422, "NO_ANSWER", "I couldn't answer that. Try rephrasing, or pick a suggested question.")
    mongo_try(lambda: db_mongo.nl_query_history.insert_one({
        "user_id": user["user_id"], "question": q, "generated_sql": sql, "row_count": len(rows),
        "success": err is None, "error": err.code if err else None, "asked_at": dt.datetime.now(dt.timezone.utc)}),
        label="nl history")
    if err:
        raise err
    return {"sql": sql, "columns": cols, "rows": rows, "chart_hint": _chart_hint(cols, rows)}


@router.get("/ml-metrics")
def ml_metrics(user: dict = Depends(require_role("admin"))):
    if not METRICS.exists():
        raise ApiError(404, "NO_METRICS", "Run the training scripts in ml/ to create reports/metrics.json")
    return json.loads(METRICS.read_text())
