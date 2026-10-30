"""Synthetic insurance-claim narratives for ICMS.

Usage
-----
    python generate_narratives.py                 # writes narratives.csv (6,000 rows) next to this file
    python generate_narratives.py --n 2000 --seed 7 --out my.csv

Import (A's seed script and B's training scripts):
    from generate_narratives import generate, paraphrase
    row = generate("accident")    # {"text", "category", "urgency", "entities"}
    copy = paraphrase(row["text"])  # reworded near-duplicate, for planting duplicate fraud

Design notes (say these in the viva)
------------------------------------
* No real claim text is available, so narratives are composed from templates + Indian slot values
  (roads, hospitals, vehicles, cities, amounts) with varied length, tone and typos.
* Urgency follows content severity (death/ICU/fire-with-injury = critical ...) and then 10% of labels
  are flipped, so a model must generalise instead of memorising one keyword.
* About 30% of rows are deliberately ambiguous: the 'other' class, narratives that mention two kinds
  of events, or events that sit between categories; 4% of category labels carry annotator noise. This keeps test F1 realistic (around 0.85-0.95) instead of a suspicious 1.0.
* Every inserted slot value is returned in `entities`, giving free ground truth for NER recall.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
from pathlib import Path

CATEGORIES = ["accident", "theft", "hospitalisation", "fire", "flood", "travel_loss", "death", "other"]
URGENCY = ["low", "medium", "high", "critical"]

# ----------------------------------------------------------------------------- slot pools
NAMES = ["Rahul", "Priya", "Arjun", "Sneha", "Vikram", "Ananya", "Karthik", "Divya", "Rohan", "Meera",
         "Suresh", "Lakshmi", "Manoj", "Kavya", "Naveen", "Pooja", "Harish", "Deepa", "Sanjay", "Nikhil"]
RELATIONS = ["father", "mother", "husband", "wife", "brother", "son", "daughter", "father-in-law"]
ROADS = ["Outer Ring Road", "Silk Board junction", "Hosur Road", "Bannerghatta Road", "Tumkur Road",
         "Mysore Road", "Old Airport Road", "Bellary Road", "Sarjapur Road", "Hebbal flyover",
         "Marathahalli bridge", "KR Puram signal", "NICE Road", "Magadi Road", "Old Madras Road"]
AREAS = ["Koramangala", "Indiranagar", "Jayanagar", "HSR Layout", "Whitefield", "Malleshwaram",
         "Rajajinagar", "Yelahanka", "BTM Layout", "Electronic City", "Hebbal", "Banashankari",
         "Bellandur", "Basavanagudi", "Vijayanagar", "JP Nagar", "Marathahalli", "Kengeri"]
CITIES = ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Chennai", "Hyderabad", "Mumbai", "Pune"]
FLOOD_AREAS = ["Bellandur", "Varthur", "Mahadevapura", "Koramangala", "Sarjapur", "Yelahanka", "Hebbal",
               "Silk Board", "HSR Layout", "Kengeri"]
BIKES = ["Activa", "Pulsar", "Splendor", "Royal Enfield Classic", "TVS Jupiter", "Apache", "Access 125", "Dio"]
CARS = ["Swift", "i20", "Baleno", "Nexon", "Creta", "City", "Innova", "Alto", "Brezza", "Venue"]
OTHER_VEHICLES = ["a car", "an auto-rickshaw", "a BMTC bus", "a truck", "a water tanker", "a cab", "a tempo"]
HOSPITALS = ["Manipal Hospital", "Narayana Health", "Apollo Hospital", "Fortis Hospital", "St John's Hospital",
             "Sakra World Hospital", "Aster CMI Hospital", "Columbia Asia Hospital", "Victoria Hospital",
             "Ramaiah Memorial Hospital", "Sparsh Hospital", "BGS Gleneagles Hospital"]
ILLNESSES = ["dengue fever", "typhoid", "appendicitis", "a kidney stone", "pneumonia", "a gallbladder infection",
             "a heart blockage", "severe gastroenteritis", "a slip disc", "chikungunya"]
PROCEDURES = ["surgery", "an angioplasty", "a laparoscopic procedure", "IV treatment", "a knee operation"]
INJURIES = ["a fractured wrist", "a broken leg", "head injuries", "a dislocated shoulder", "deep cuts on my arm",
            "a hairline fracture", "bruises and a sprained ankle", "a fractured collarbone"]
AIRLINES = ["IndiGo", "Air India", "Akasa Air", "SpiceJet", "Air India Express", "Emirates", "Singapore Airlines"]
ABROAD = ["Dubai", "Singapore", "Bangkok", "London", "Kuala Lumpur", "Paris", "Frankfurt", "Bali"]
STOLEN_ITEMS = ["laptop", "gold chain", "mobile phone", "wallet with cards", "TV and jewellery", "camera", "cash and jewellery"]
POLICE_STATIONS = ["Koramangala", "HSR Layout", "Indiranagar", "Whitefield", "Jayanagar", "Hebbal", "Madiwala"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]

# ----------------------------------------------------------------------------- templates
# Each core template is (text, severity). Severity: 0 low, 1 medium, 2 high, 3 critical.
# Detail templates add facts and can raise severity. {slots} are filled by fill().
CORE = {
    "accident": [
        ("My {bike} {vno} was hit by {other_vehicle} near {road} on {date} around {time}.", 1),
        ("I was riding my {bike} on {road} when {other_vehicle} rammed into me from behind.", 1),
        ("My {car} {vno} was rear-ended at the {road} signal on {date}.", 0),
        ("The bike skidded on a pothole near {area} and I fell on the road.", 1),
        ("{other_vehicle_cap} took a sudden U-turn on {road} and collided with my {car}.", 1),
        ("While parking in {area} my {car} was scraped by {other_vehicle} and the bumper broke.", 0),
        ("Our {car} {vno} met with an accident on {road} while going to {city} on {date}.", 2),
        ("I lost control of my {bike} on the wet road at {area} and hit the divider.", 1),
        ("A speeding cab hit my parked {bike} outside my house in {area}.", 0),
        ("Minor collision with {other_vehicle} at {road}, the side mirror and door are damaged.", 0),
        ("I was admitted to {hospital} after a road accident on {road}.", 2),
        ("My {car} slid into a flooded underpass at {flood_area} and hit the wall.", 1),
    ],
    "theft": [
        ("My {bike} {vno} was stolen from the parking outside my office in {area} on {date}.", 1),
        ("Someone broke into our house in {area} while we were away and took the {item}.", 1),
        ("My {car} was stolen from the basement parking of our apartment in {area}.", 1),
        ("Two men on a bike snatched my {item} near {road} on {date} around {time}.", 1),
        ("Thieves broke the lock of my shop in {area} and took {amount_words} worth of stock.", 1),
        ("My {item} was stolen from the {car} when the window was smashed at {area}.", 0),
        ("There was a burglary at our flat in {area} on the night of {date}.", 1),
        ("The {bike} parked near {area} metro station is missing since {date}.", 0),
        ("My bag with the {item} was stolen at the railway station in {city}.", 0),
    ],
    "hospitalisation": [
        ("I was admitted to {hospital} on {date} with {illness} and stayed for {days} days.", 2),
        ("My {relation} was hospitalised at {hospital} for {illness}.", 2),
        ("I underwent {procedure} at {hospital} after being diagnosed with {illness}.", 2),
        ("I was admitted to the ICU at {hospital} after a sudden heart attack.", 3),
        ("My {relation} needed emergency {procedure} at {hospital} on {date}.", 3),
        ("Admitted to {hospital} for {days} days due to {illness}, now discharged.", 2),
        ("Day care treatment at {hospital} for {illness}, no overnight stay.", 1),
        ("My child had high fever and was admitted to {hospital} for {days} days.", 2),
        ("I had a fall at home and was treated at {hospital} for {injury}.", 2),
        ("I got {injury} in a bike accident and was admitted to {hospital} for {days} days.", 2),
        ("My {relation} got burn injuries in a kitchen accident and was admitted to {hospital}.", 3),
    ],
    "fire": [
        ("A short circuit caused a fire in the kitchen of our house in {area} on {date}.", 1),
        ("Our shop in {area} caught fire at night and most of the stock was burnt.", 2),
        ("A gas cylinder leak led to a fire in our flat in {area}.", 2),
        ("Fire broke out in the godown at {area} due to an electrical fault.", 2),
        ("The AC unit sparked and burnt the curtains and furniture in the bedroom.", 1),
        ("Our {car} caught fire on {road} because of a wiring problem.", 1),
        ("Fire in the apartment above spread to our flat in {area} and two of us got burn injuries.", 3),
    ],
    "flood": [
        ("Heavy rain flooded the basement of our apartment in {flood_area} and my {car} was submerged.", 1),
        ("Water entered our ground floor house in {flood_area} up to {water} feet during the rains.", 1),
        ("The lake overflowed near {flood_area} and our house was flooded on {date}.", 2),
        ("My {bike} was washed away in the flood water near {flood_area}.", 1),
        ("Roof leakage during the monsoon damaged the ceiling and electrical wiring.", 0),
        ("Flood water damaged all the furniture and appliances in our home at {flood_area}.", 1),
        ("Our shop in {flood_area} was under {water} feet of water for two days.", 2),
    ],
    "travel_loss": [
        ("My checked-in baggage was lost on the {airline} flight from {city} to {abroad} on {date}.", 0),
        ("{airline} cancelled my flight to {abroad} and I had to book a new ticket.", 0),
        ("My passport and wallet were stolen while travelling in {abroad}.", 1),
        ("The {airline} flight was delayed by {days} hours and I missed my connecting flight.", 0),
        ("I fell ill during my trip to {abroad} and was treated at a local clinic.", 1),
        ("My bag with the {item} was lost at the airport in {abroad}.", 0),
        ("Our trip to {abroad} was cancelled because of a family emergency.", 0),
        ("My wallet was stolen in a taxi during my trip to {abroad}.", 1),
        ("I had an accident while on a holiday in {abroad} and needed treatment.", 1),
    ],
    "death": [
        ("My {relation}, the insured, passed away at {hospital} on {date} due to {illness}.", 3),
        ("The policyholder died in a road accident on {road} on {date}.", 3),
        ("My {relation} passed away suddenly of a heart attack at home in {area}.", 3),
        ("I am the nominee. My {relation} expired on {date} after a long illness.", 3),
        ("The insured person died during treatment at {hospital}.", 3),
    ],
    "other": [
        ("My mobile phone screen cracked when it fell from my hand.", 0),
        ("A tree fell on our compound wall in {area} during the storm.", 1),
        ("My pet dog was injured and needed treatment at a vet clinic.", 0),
        ("The lift in our building broke down and damaged my furniture while shifting.", 0),
        ("My laptop stopped working after a power surge at home.", 0),
        ("Some damage happened to my property in {area}, need to claim the repair cost.", 0),
        ("A cricket ball broke the windshield of my {car} parked in {area}.", 0),
        ("I want to claim for the loss that happened last week, details are in the documents.", 0),
        ("The washing machine flooded the bathroom and damaged the wooden door.", 0),
        ("Small fire from a diya burnt the curtains, no other damage.", 0),
        ("My phone was damaged when I fell from the bike, it is not working.", 0),
        ("Water pipe burst in the kitchen and damaged the cupboards.", 0),
    ],
}

DETAILS = {
    "accident": [
        ("I got {injury} and was taken to {hospital}.", 2),
        ("The vehicle is badly damaged and not drivable.", 0),
        ("Garage estimate for repair is {amount}.", 0),
        ("The other driver ran away without stopping.", 0),
        ("Traffic police at {ps} station registered the case.", 0),
        ("My pillion rider also got hurt and is admitted to {hospital}.", 2),
        ("Several parts need replacement as per the garage.", 0),
        ("I was unconscious for some time and was shifted to the ICU.", 3),
    ],
    "theft": [
        ("An FIR has been filed at {ps} police station, FIR number {fir}.", 0),
        ("The total value of the stolen items is around {amount}.", 0),
        ("CCTV footage of the area is being checked by the police.", 0),
        ("Nothing has been recovered so far.", 0),
        ("Everything was locked properly before this happened.", 0),
    ],
    "hospitalisation": [
        ("The hospital bill came to {amount}.", 0),
        ("Doctors said surgery was needed immediately.", 1),
        ("The patient was in the ICU for {days} days.", 3),
        ("All discharge papers and bills are attached.", 0),
        ("Platelet count dropped very low and a transfusion was needed.", 3),
    ],
    "fire": [
        ("The fire brigade came and put out the fire.", 0),
        ("The loss is estimated at {amount}.", 0),
        ("My {relation} got burn injuries and was treated at {hospital}.", 3),
        ("All the electrical appliances and documents were destroyed.", 0),
        ("Nobody was hurt but the damage is heavy.", 0),
    ],
    "flood": [
        ("Nothing is working properly after the water went down.", 0),
        ("The repair estimate is {amount}.", 0),
        ("BBMP officials visited and took photos of the damage.", 0),
        ("We had to move to a relative's house for three days.", 1),
        ("The fridge, washing machine and sofa are spoilt.", 0),
    ],
    "travel_loss": [
        ("The airline gave a property irregularity report.", 0),
        ("I had to buy clothes and essentials worth {amount}.", 0),
        ("I filed a police complaint at the local station.", 0),
        ("The extra expense for the new ticket was {amount}.", 0),
        ("I contacted the Indian embassy for an emergency certificate.", 1),
    ],
    "death": [
        ("The death certificate and hospital records are attached.", 0),
        ("I am submitting this claim as the nominee.", 0),
        ("The family is depending on this amount for expenses.", 0),
        ("Post-mortem was done at {hospital}.", 0),
    ],
    "other": [
        ("The repair cost is {amount}.", 0),
        ("I am not sure which policy covers this.", 0),
        ("Photos are attached.", 0),
    ],
}

OPENERS = {
    "formal": ["Respected Sir/Madam,", "Dear Claims Team,", "To the Claims Department,", "I wish to report the following incident."],
    "casual": ["Hi,", "Hello team,", "Hi, need help with a claim.", ""],
    "broken": ["sir pls help", "hello sir", "", "Sir,"],
}
CLOSERS = {
    "formal": ["Kindly process my claim at the earliest.", "I request you to settle the claim.", "Thank you for your support."],
    "casual": ["Please process this soon.", "Let me know what else you need.", "Thanks!", ""],
    "broken": ["pls do the needful", "kindly do needful sir", "plz settle fast", ""],
}

# Words swapped by paraphrase(); keys are matched case-insensitively on word boundaries.
SYNONYMS = {
    "was hit by": ["got hit by", "was struck by"], "hit": ["struck"], "was stolen": ["got stolen", "was taken"],
    "stolen": ["taken", "robbed"], "was admitted": ["got admitted", "was hospitalised"], "admitted": ["hospitalised"],
    "damaged": ["spoilt", "ruined"], "broken": ["smashed", "cracked"], "near": ["close to", "next to"],
    "house": ["home"], "flooded": ["filled with water", "inundated"], "caught fire": ["was gutted by fire", "went up in flames"],
    "passed away": ["died", "expired"], "skidded": ["slipped"], "got hurt": ["was injured"], "fell": ["fell down"],
    "estimate": ["quote"], "lost": ["misplaced"], "missing": ["not found"], "Please": ["Kindly"], "repair": ["fixing"],
    "total": ["overall"], "immediately": ["urgently"], "is admitted": ["has been admitted"], "on the road": ["on the street"],
    "around": ["approximately"], "heavy": ["severe"], "Thieves": ["Robbers"], "Someone": ["Some people"],
    "fire brigade": ["fire service"], "put out": ["extinguished"], "led to": ["caused"], "flat": ["apartment"],
    "Nobody": ["No one"], "came": ["arrived"], "attached": ["enclosed"], "need": ["require"], "worth": ["valued at"],
    "while we were away": ["when nobody was home"], "during the rains": ["in the heavy rain"],
    "bill": ["invoice"], "treated": ["given treatment"], "cancelled": ["called off"], "delayed": ["late"],
}


# ----------------------------------------------------------------------------- helpers
def _vno(rng: random.Random) -> str:
    sep = rng.choice([" ", "-", ""])
    return sep.join(["KA", f"{rng.randint(1, 63):02d}", rng.choice(["AB", "MK", "HJ", "EV", "Z", "C", "MN"]),
                     f"{rng.randint(1000, 9999)}"])


def _amount(rng: random.Random, lo=5_000, hi=4_00_000) -> str:
    n = round(rng.randint(lo, hi), -2)
    style = rng.random()
    if style < 0.4:
        return f"Rs {n:,}".replace(",", "")
    if style < 0.7:
        return f"₹{n:,}"
    if style < 0.85:
        return f"Rs. {n}"
    return f"{n} rupees"


def _date(rng: random.Random) -> str:
    style = rng.random()
    if style < 0.5:
        return f"{rng.randint(1, 28)} {rng.choice(MONTHS)}"
    if style < 0.75:
        return f"{rng.randint(1, 28)}/{rng.randint(1, 12)}/2026"
    return rng.choice(["yesterday", "last Monday", "last week", "the night of Diwali", "Sunday morning"])


def _time(rng: random.Random) -> str:
    return rng.choice([f"{rng.randint(6, 11)} am", f"{rng.randint(1, 11)} pm", "midnight", "early morning", "evening"])


SLOT_LABELS = {"vno": "VEHICLE_NO", "hospital": "HOSPITAL", "amount": "MONEY", "date": "DATE",
               "road": "LOC", "area": "LOC", "flood_area": "LOC", "city": "LOC", "abroad": "LOC",
               "airline": "ORG", "ps": "LOC"}


def fill(template: str, rng: random.Random, ents: list[dict]) -> str:
    """Fill every {slot} in a template; record labelled slot values in ents."""
    def val(slot: str) -> str:
        v = {
            "bike": lambda: rng.choice(BIKES), "car": lambda: rng.choice(CARS), "vno": lambda: _vno(rng),
            "other_vehicle": lambda: rng.choice(OTHER_VEHICLES),
            "other_vehicle_cap": lambda: rng.choice(OTHER_VEHICLES).capitalize(),
            "road": lambda: rng.choice(ROADS), "area": lambda: rng.choice(AREAS),
            "flood_area": lambda: rng.choice(FLOOD_AREAS), "city": lambda: rng.choice(CITIES),
            "abroad": lambda: rng.choice(ABROAD), "airline": lambda: rng.choice(AIRLINES),
            "hospital": lambda: rng.choice(HOSPITALS), "illness": lambda: rng.choice(ILLNESSES),
            "procedure": lambda: rng.choice(PROCEDURES), "injury": lambda: rng.choice(INJURIES),
            "relation": lambda: rng.choice(RELATIONS), "item": lambda: rng.choice(STOLEN_ITEMS),
            "ps": lambda: rng.choice(POLICE_STATIONS), "fir": lambda: f"{rng.randint(100, 999)}/2026",
            "amount": lambda: _amount(rng), "amount_words": lambda: _amount(rng),
            "date": lambda: _date(rng), "time": lambda: _time(rng),
            "days": lambda: str(rng.randint(2, 9)), "water": lambda: str(rng.randint(2, 5)),
        }[slot]()
        if slot in SLOT_LABELS:
            ents.append({"text": v, "label": SLOT_LABELS[slot]})
        return v

    return re.sub(r"\{(\w+)\}", lambda m: val(m.group(1)), template)


def _typos(text: str, rng: random.Random) -> str:
    words = text.split()
    for _ in range(rng.randint(2, 4)):
        i = rng.randrange(len(words))
        w = words[i]
        if len(w) < 4 or not w.isalpha():
            continue
        j = rng.randrange(1, len(w) - 1)
        op = rng.random()
        words[i] = (w[:j] + w[j + 1:] if op < 0.4 else            # drop a letter
                    w[:j] + w[j + 1] + w[j] + w[j + 2:] if op < 0.8 else  # swap two letters
                    w[:j] + w[j] + w[j:])                         # double a letter
    return " ".join(words)


def _broken_english(text: str, rng: random.Random) -> str:
    t = text.replace("I was", "i was").replace("My ", "my ").replace(" the ", " ").replace("was ", "")
    if rng.random() < 0.5:
        t = t.replace(".", " ").replace(",", "")
    return re.sub(r"\s+", " ", t).strip()


# ----------------------------------------------------------------------------- public API
def generate(category: str | None = None, seed: int | None = None, rng: random.Random | None = None) -> dict:
    """Return {"text", "category", "urgency", "entities"} for one synthetic claim narrative."""
    rng = rng or random.Random(seed)
    category = category or rng.choice(CATEGORIES)
    ents: list[dict] = []

    core_t, sev = rng.choice(CORE[category])
    parts = [fill(core_t, rng, ents)]
    for t, s in rng.sample(DETAILS[category], k=min(len(DETAILS[category]), rng.choice([0, 1, 1, 2, 2, 3]))):
        parts.append(fill(t, rng, ents))
        sev = max(sev, s)

    # ~18% mention a second kind of event (label stays the primary one) -> realistic ambiguity
    if rng.random() < 0.18:
        second = rng.choice([c for c in CATEGORIES if c not in (category, "death")])
        t, _ = rng.choice(CORE[second])
        s2 = fill(t, rng, ents)
        if rng.random() < 0.4:
            parts.insert(0, "Earlier, " + s2[0].lower() + s2[1:] + " But this claim is for the following.")
        else:
            parts.append("Also, " + s2[0].lower() + s2[1:])

    tone = rng.choices(["formal", "casual", "broken"], weights=[0.35, 0.45, 0.2])[0]
    opener, closer = rng.choice(OPENERS[tone]), rng.choice(CLOSERS[tone])
    body = " ".join(parts)
    if tone == "broken":
        body = _broken_english(body, rng)
    text = " ".join(x for x in (opener, body, closer) if x).strip()
    if rng.random() < 0.10:
        text = _typos(text, rng)

    urgency = URGENCY[sev]
    if rng.random() < 0.10:  # label noise: forces the model to learn, not memorise
        urgency = URGENCY[max(0, min(3, sev + rng.choice([-1, 1])))]

    label = category
    if rng.random() < 0.04:  # annotator disagreement: real claim labels are never perfectly consistent
        label = rng.choice([c for c in CATEGORIES if c != category])

    ents = [e for e in ents if e["text"] in text]  # drop entities mangled by typos/tone
    return {"text": text, "category": label, "urgency": urgency, "entities": ents}


def nudge_any(m: re.Match, fn) -> str:
    """Normalise the two alternatives of the money regex into (prefix, digits, suffix)."""
    class _M:
        def __init__(self, g): self.g = g
        def group(self, i): return self.g[i - 1]
    if m.group(2):
        return fn(_M((m.group(1), m.group(2), "")))
    return fn(_M(("", m.group(5), m.group(6))))


def paraphrase(text: str, seed: int | None = None) -> str:
    """Reword a narrative so it reads differently but means the same (duplicate-fraud planting)."""
    rng = random.Random(seed)
    # one pass over all phrases (longest first) so substitutions never chain into each other
    keys = sorted(SYNONYMS, key=len, reverse=True)
    pattern = re.compile(r"\b(" + "|".join(re.escape(k) for k in keys) + r")\b")
    out = text
    for o in sorted((o for v in OPENERS.values() for o in v if o), key=len, reverse=True):
        if out.startswith(o):
            out = out[len(o):].lstrip()
            break
    out = pattern.sub(lambda m: rng.choice(SYNONYMS[m.group(1)]) if rng.random() < 0.85 else m.group(1), out)
    # swap greeting/closing phrases for different ones

    def nudge(m: re.Match) -> str:  # change money amounts by 2-8% so exact matching fails (never dates/FIRs)
        prefix, digits, suffix = m.group(1) or "", m.group(2), m.group(3) or ""
        n = int(digits.replace(",", ""))
        new = int(round(n * rng.uniform(0.92, 1.08), -2))
        shown = f"{new:,}" if "," in digits else str(new)
        return f"{prefix}{shown}{suffix}"
    out = re.sub(r"(Rs\.?\s?|₹)([\d,]{4,})()|()([\d,]{4,})( rupees)",
                 lambda m: nudge_any(m, nudge), out)

    sents = re.split(r"(?<=[.!?])\s+", out)
    if len(sents) > 2 and rng.random() < 0.6:  # reorder middle sentences
        mid = sents[1:-1]
        rng.shuffle(mid)
        sents = [sents[0], *mid, sents[-1]]
    lead = rng.choice(["", "Regarding my claim: ", "Incident details: ", "I want to report that ", "Claim request: "])
    body = " ".join(sents)
    if lead and body and not body.startswith("I "):
        body = body[0].lower() + body[1:]
    return (lead + body).strip()


def build_dataset(n: int = 6000, seed: int = 42) -> list[dict]:
    """Balanced-ish dataset: 'other' and 'death' are rarer, like real claim mixes."""
    rng = random.Random(seed)
    weights = {"accident": 0.2, "theft": 0.13, "hospitalisation": 0.2, "fire": 0.09, "flood": 0.1,
               "travel_loss": 0.1, "death": 0.06, "other": 0.12}
    cats = rng.choices(list(weights), weights=list(weights.values()), k=n)
    return [generate(c, rng=rng) for c in cats]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--n", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).with_name("narratives.csv")))
    a = ap.parse_args()
    rows = build_dataset(a.n, a.seed)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["text", "category", "urgency", "entities"])
        w.writeheader()
        for r in rows:
            w.writerow({**r, "entities": json.dumps(r["entities"], ensure_ascii=False)})
    from collections import Counter
    print(f"Wrote {len(rows)} rows to {a.out}")
    print("category:", dict(Counter(r["category"] for r in rows)))
    print("urgency: ", dict(Counter(r["urgency"] for r in rows)))


if __name__ == "__main__":
    main()
