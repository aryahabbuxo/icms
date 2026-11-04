import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

log = logging.getLogger("icms.errors")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def register_handlers(app: FastAPI):
    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        loc = ".".join(str(x) for x in first["loc"] if x != "body")
        return JSONResponse(status_code=422, content=body("VALIDATION_ERROR", f"{loc}: {first['msg']}"))

    @app.exception_handler(DBAPIError)
    async def db_error(request: Request, exc: DBAPIError):
        args = getattr(exc.orig, "args", (0, str(exc)))
        code, msg = (args + ("",))[:2] if len(args) >= 2 else (0, str(exc.orig))
        if code == 1644 and ":" in msg:  # SIGNAL SQLSTATE '45000' from a trigger
            c, m = msg.split(":", 1)
            return JSONResponse(status_code=422, content=body(c.strip(), m.strip()))
        if code == 3819:
            return JSONResponse(status_code=422, content=body("CHECK_FAILED", msg))
        if code == 1452:
            return JSONResponse(status_code=422, content=body("INVALID_REFERENCE", "Referenced record does not exist"))
        if code == 1062:
            return JSONResponse(status_code=409, content=body("DUPLICATE", msg))
        log.exception("Unhandled DB error")
        return JSONResponse(status_code=500, content=body("DB_ERROR", "Database error"))
