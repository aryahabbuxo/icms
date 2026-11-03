"""Entity extraction tuned for Indian claim narratives.

Three layers, highest priority first (a lower layer never overrides a span a higher one found):
  1. Regex       VEHICLE_NO (KA 01 AB 1234), MONEY (Rs / ₹ / INR / "rupees"), HOSPITAL ("<Name> Hospital")
  2. Gazetteer   known hospitals, Bengaluru roads and areas, Indian and foreign cities, airlines
  3. spaCy       en_core_web_sm for PERSON, DATE, ORG, LOC/GPE/FAC (optional: skipped if not installed)
Labels returned: PERSON, LOC, DATE, MONEY, ORG, VEHICLE_NO, HOSPITAL (Shared Spec).
"""
from __future__ import annotations

import re
from functools import lru_cache

HOSPITALS = ["Manipal Hospital", "Narayana Health", "Apollo Hospital", "Fortis Hospital", "St John's Hospital",
             "Sakra World Hospital", "Aster CMI Hospital", "Columbia Asia Hospital", "Victoria Hospital",
             "Ramaiah Memorial Hospital", "Sparsh Hospital", "BGS Gleneagles Hospital", "Bowring Hospital",
             "Jayadeva Hospital", "NIMHANS", "Kidwai", "Cloudnine Hospital", "Motherhood Hospital"]
PLACES = ["Outer Ring Road", "ORR", "Silk Board junction", "Silk Board", "Hosur Road", "Bannerghatta Road", "Tumkur Road",
          "Mysore Road", "Old Airport Road", "Bellary Road", "Sarjapur Road", "Hebbal flyover", "Marathahalli bridge",
          "KR Puram signal", "KR Puram", "NICE Road", "Magadi Road", "Old Madras Road", "MG Road", "Brigade Road",
          "Majestic", "Koramangala", "Indiranagar", "Jayanagar", "HSR Layout", "Whitefield", "Malleshwaram",
          "Rajajinagar", "Yelahanka", "BTM Layout", "Electronic City", "Hebbal", "Banashankari", "Bellandur",
          "Basavanagudi", "Vijayanagar", "JP Nagar", "Marathahalli", "Kengeri", "Varthur", "Mahadevapura",
          "Sarjapur", "Madiwala", "Yeshwanthpur", "Domlur", "Ulsoor", "Peenya", "Bommanahalli", "RT Nagar",
          "Bengaluru", "Bangalore", "Mysuru", "Mysore", "Mangaluru", "Hubballi", "Chennai", "Hyderabad", "Mumbai",
          "Pune", "Delhi", "Kolkata", "Dubai", "Singapore", "Bangkok", "London", "Kuala Lumpur", "Paris",
          "Frankfurt", "Bali"]
AIRLINES = ["IndiGo", "Air India Express", "Air India", "Akasa Air", "SpiceJet", "Vistara", "Emirates",
            "Singapore Airlines"]

_VEHICLE = re.compile(r"\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b")
_MONEY = re.compile(r"(?:₹|\bRs\.?|\bINR)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore))?|\b\d[\d,]{2,}\s?(?:rupees|/-)",
                    re.I)
_HOSP = re.compile(r"\b(?:[A-Z][\w']+\s){1,3}(?:Hospital|Hospitals|Health|Clinic|Nursing Home)\b")


def _gaz_regex(words: list[str]) -> re.Pattern:
    alts = sorted(words, key=len, reverse=True)  # longest first: "Silk Board junction" before "Silk Board"
    return re.compile(r"(?<![\w])(" + "|".join(re.escape(w) for w in alts) + r")(?![\w])", re.I)


_GAZ = [("HOSPITAL", _gaz_regex(HOSPITALS)), ("LOC", _gaz_regex(PLACES)), ("ORG", _gaz_regex(AIRLINES))]
_SPACY_MAP = {"PERSON": "PERSON", "DATE": "DATE", "ORG": "ORG", "GPE": "LOC", "LOC": "LOC", "FAC": "LOC"}


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy
        return spacy.load("en_core_web_sm", disable=["parser", "lemmatizer"])
    except Exception:
        return None


def extract(text: str) -> list[dict]:
    spans: list[tuple[int, int, str]] = []

    def free(a: int, b: int) -> bool:
        return all(b <= s or a >= e for s, e, _ in spans)

    for label, rx in (("VEHICLE_NO", _VEHICLE), ("MONEY", _MONEY), ("HOSPITAL", _HOSP)):
        for m in rx.finditer(text):
            if free(*m.span()):
                spans.append((*m.span(), label))
    for label, rx in _GAZ:
        for m in rx.finditer(text):
            if free(*m.span()):
                spans.append((*m.span(), label))

    nlp = _nlp()
    if nlp is not None:
        for ent in nlp(text).ents:
            label = _SPACY_MAP.get(ent.label_)
            t = ent.text.strip()
            if not label or len(t) < 2 or not free(ent.start_char, ent.end_char):
                continue
            if label == "DATE" and re.fullmatch(r"[\d,./-]+", t) and not re.search(r"[/-]", t):
                continue  # bare numbers like "1234" or "85000" are not dates
            if label == "ORG" and t.lower() in {"fir", "kindly", "sir", "garage", "icu", "bbmp"}:
                continue
            if label == "PERSON" and t.isupper():
                continue
            spans.append((ent.start_char, ent.end_char, label))

    spans.sort()
    out, seen = [], set()
    for s, e, label in spans:
        t = text[s:e].strip(" ,.")
        if t and (t.lower(), label) not in seen:
            seen.add((t.lower(), label))
            out.append({"text": t, "label": label})
    return out
