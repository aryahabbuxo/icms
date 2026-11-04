"""Use B's icms_ml when installed, else the built-in fallback. Backend code imports only from here."""
import logging
from . import ml_fallback as _fb

log = logging.getLogger("icms.ml")
try:
    import icms_ml as _real
    ML_SOURCE = "icms_ml"
except Exception as e:  # not installed yet
    _real, ML_SOURCE = None, "fallback"
    log.warning("icms_ml not available (%s); using built-in fallback", e)


def _pick(name):
    return getattr(_real, name, None) or getattr(_fb, name)


preprocess = _pick("preprocess")
classify = _pick("classify")
extract_entities = _pick("extract_entities")
embed = _pick("embed")
find_duplicate = _pick("find_duplicate")
score_fraud = _pick("score_fraud")
ocr = _pick("ocr")
nl_to_sql = _pick("nl_to_sql")
