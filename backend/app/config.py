import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MYSQL_URL = os.getenv("MYSQL_URL", "mysql+pymysql://icms_app:icms_pass@localhost:3306/icms")
MYSQL_READONLY_URL = os.getenv("MYSQL_READONLY_URL", "mysql+pymysql://icms_ro:ro_pass@localhost:3306/icms")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "icms_docs")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_HOURS = 12
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
