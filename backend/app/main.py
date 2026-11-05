from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from .errors import register_handlers
from .db_mongo import create_indexes
from .routers import admin, auth, policies, claims, adjusters, notifications

app = FastAPI(title="ICMS API", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
register_handlers(app)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(policies.router)
api.include_router(claims.router)
api.include_router(adjusters.router)
api.include_router(notifications.router)
api.include_router(admin.router)


@api.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


app.include_router(api)


@app.on_event("startup")
def startup():
    create_indexes()
