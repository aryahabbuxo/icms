import logging
from pymongo import MongoClient
import gridfs
from .config import MONGO_URL, MONGO_DB

log = logging.getLogger("icms.mongo")
client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
db = client[MONGO_DB]
fs = gridfs.GridFS(db)

narratives = db.claim_narratives
documents = db.claim_documents
fraud_explanations = db.fraud_explanations
nl_query_history = db.nl_query_history


def create_indexes():
    try:
        for coll in (narratives, documents, fraud_explanations):
            coll.create_index("claim_id")
    except Exception as e:  # Mongo down must not stop the API from booting
        log.warning("Mongo indexes not created: %s", e)
