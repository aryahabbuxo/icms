#!/usr/bin/env python3
"""ICMS seed data. Run on a freshly built DB (db/01..06 loaded).

    pip install pymysql faker bcrypt pymongo
    python db/seed/seed.py

Inserts through the app user so the triggers run. Deterministic (seed 42);
dates are relative to today. Fraud scores/categories here are SYNTHETIC
placeholders - re-score with B's real models later.
"""
import csv
import datetime as dt
import json
import os
import random
import re
import sys
from pathlib import Path

import bcrypt
import pymysql
from faker import Faker

ROOT = Path(__file__).resolve().parents[2]
random.seed(42)
Faker.seed(42)
fake = Faker("en_IN")
TODAY = dt.date.today()
ri = random.randint


def D(n):
    return dt.timedelta(days=int(n))


DB = dict(
    host=os.getenv("MYSQL_HOST", "localhost"),
    port=int(os.getenv("MYSQL_PORT", "3306")),
    user=os.getenv("SEED_MYSQL_USER", "icms_app"),
    password=os.getenv("SEED_MYSQL_PASSWORD", "icms_pass"),
    database="icms",
    charset="utf8mb4",
    autocommit=False,
)
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "icms_docs")

N_CUSTOMERS, N_AGENTS, N_POLICIES, N_CLAIMS = 2000, 25, 3000, 5000
FRAUD_CLAIMS = 400  # 8%

CITIES = ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Chennai", "Hyderabad", "Mumbai", "Pune"]
CITY_W = [40, 10, 8, 7, 12, 10, 8, 5]
SPECS = ["health", "motor", "life", "property", "travel"]
TYPE_ID = {n: i + 1 for i, n in enumerate(SPECS)}
TYPE_INFO = {
    "health": ("Hospitalisation, surgery, day-care and pre/post hospitalisation expenses.", 18000, (300000, 1000000)),
    "motor": ("Own damage, theft and third-party liability for two-wheelers and cars.", 9000, (100000, 1000000)),
    "life": ("Death benefit paid to the nominee, with optional accidental death rider.", 25000, (1000000, 5000000)),
    "property": ("Fire, flood, burglary and natural calamity cover for home and contents.", 12000, (500000, 5000000)),
    "travel": ("Trip cancellation, baggage loss, delay and overseas medical cover.", 8000, (100000, 500000)),
}
TYPE_W = [30, 35, 10, 15, 10]  # health, motor, life, property, travel

PLACES = ["Silk Board", "Hebbal", "Electronic City", "Whitefield", "Koramangala", "Indiranagar",
          "Marathahalli", "Jayanagar", "Outer Ring Road", "Yeshwanthpur", "Bannerghatta Road", "KR Puram"]
VEHICLES = ["Honda Activa", "Royal Enfield", "Maruti Swift", "Hyundai i20", "Bajaj Pulsar", "TVS Jupiter"]
HOSPITALS = ["Manipal Hospital", "Apollo Hospital", "Fortis Hospital", "Narayana Health", "Columbia Asia"]
AILMENTS = ["dengue fever", "appendicitis", "a leg fracture", "typhoid", "a kidney stone", "pneumonia"]
PROPS = ["flat", "house", "shop", "godown"]

TEMPLATES = {
    "accident": [
        "My {veh} was hit by another vehicle near {place} on {d}. The front portion is badly damaged and the garage estimate is around Rs {amt}.",
        "While riding to work my {veh} skidded on a wet road near {place} and I fell. The vehicle needs major repairs and I have the workshop bill of Rs {amt}.",
        "A truck rammed into my {veh} at the {place} junction. Police were informed and the vehicle is not drivable. Repair cost is Rs {amt}.",
    ],
    "theft": [
        "My {veh} was stolen from outside my house near {place} last night. I have filed an FIR at the local station. Value of the vehicle is about Rs {amt}.",
        "Burglars broke into my home near {place} and took jewellery and cash worth Rs {amt}. FIR copy is attached.",
    ],
    "hospitalisation": [
        "I was admitted to {hosp} for {ail} for {n} days. The total hospital bill is Rs {amt} and I have the discharge summary.",
        "My father was hospitalised at {hosp} with {ail}. He needed surgery and {n} days of stay. The bill comes to Rs {amt}.",
    ],
    "fire": [
        "A fire broke out in my {prop} near {place} due to a short circuit. Furniture and electronics worth Rs {amt} were destroyed.",
    ],
    "flood": [
        "Heavy rain flooded my {prop} near {place} and damaged the ground floor, furniture and appliances. The loss is estimated at Rs {amt}.",
    ],
    "travel_loss": [
        "My checked baggage was lost by the airline on my trip from {place} and I had to buy essentials. Claiming Rs {amt}.",
        "My flight was cancelled at short notice and I lost prepaid hotel bookings worth Rs {amt}.",
    ],
    "death": [
        "I am filing this claim as nominee after the sudden death of the policyholder due to {ail}. The death certificate is attached. Sum claimed is Rs {amt}.",
    ],
    "other": [
        "My insured items were damaged during shifting to a new house near {place}. The estimated loss is Rs {amt}.",
    ],
}
CATS_BY_TYPE = {
    "motor": (["accident", "theft", "other"], [60, 30, 10]),
    "health": (["hospitalisation", "other"], [92, 8]),
    "life": (["death", "other"], [88, 12]),
    "property": (["fire", "flood", "theft", "other"], [30, 30, 30, 10]),
    "travel": (["travel_loss", "hospitalisation", "theft", "other"], [50, 20, 20, 10]),
}
URGENCY_BY_CAT = {
    "death": (["high", "critical"], [60, 40]), "fire": (["high", "critical"], [70, 30]),
    "flood": (["high", "medium"], [70, 30]), "hospitalisation": (["medium", "high"], [60, 40]),
    "accident": (["medium", "high"], [55, 45]), "theft": (["medium", "low"], [70, 30]),
    "travel_loss": (["low", "medium"], [70, 30]), "other": (["low", "medium"], [80, 20]),
}
REWORD = {"hit": "struck", "near": "close to", "badly": "severely", "bill": "invoice", "stolen": "taken",
          "admitted": "hospitalised", "damaged": "harmed", "estimate": "quotation", "Rs": "INR",
          "broke into": "entered", "filed": "lodged"}


# ---- narratives: use B's generator (ml/data/generate_narratives.py) so stories vary and copies are real rewordings
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "ml", "data"))
from generate_narratives import CATEGORIES as _GEN_CATS, generate as _gen, paraphrase as _para


def narrative(cat, amount):
    text = _gen(cat if cat in _GEN_CATS else "other", rng=random)["text"]
    if random.random() < 0.3:
        text += f" You can reach me on {fake.msisdn()[-10:]}."
    return text


def reword(text):
    return _para(text, seed=random.randint(0, 10**9))


def phone():
    return str(ri(6, 9)) + "".join(random.choices("0123456789", k=9))


def rnd(x, base=100):
    return int(round(x / base) * base)


def main():
    conn = pymysql.connect(**DB)
    cur = conn.cursor()
    cur.execute("SET @app_user = 'seed'")
    pw_hash = bcrypt.hashpw(b"Demo@123", bcrypt.gensalt(rounds=10)).decode()
    narratives = {}  # claim_id -> text
    labels = []      # (claim_id, is_fraud, signals)

    # ---------------- POLICY_TYPE, AGENT, ADJUSTER ----------------
    cur.executemany("INSERT INTO POLICY_TYPE (type_id,type_name,coverage_desc,base_premium) VALUES (%s,%s,%s,%s)",
                    [(TYPE_ID[n], n, TYPE_INFO[n][0], TYPE_INFO[n][1]) for n in SPECS])

    agents = [(1, "Suresh Kumar", phone(), "suresh@demo.in", "Bengaluru")]
    for i in range(2, N_AGENTS + 1):
        agents.append((i, fake.name(), phone(), f"agent{i}@demo.in", CITIES[(i - 1) % len(CITIES)]))
    cur.executemany("INSERT INTO AGENT (agent_id,name,phone,email,branch) VALUES (%s,%s,%s,%s,%s)", agents)

    adj = [(1, "Ramesh K", "ramesh@demo.in", "motor", "Bengaluru", 0),
           (2, "Kavitha R", "kavitha@demo.in", "motor", "Bengaluru", 1)]
    aid = 3
    for s in SPECS:
        n_new = 4 if s == "motor" else 6
        for j in range(n_new):
            senior = 1 if (s != "motor" and j == 0) or (s == "health" and j == 1) else 0
            adj.append((aid, fake.name(), f"adjuster{aid}@demo.in", s, CITIES[(aid - 1) % len(CITIES)], senior))
            aid += 1
    cur.executemany("INSERT INTO ADJUSTER (adjuster_id,name,email,specialization,region,is_senior) VALUES (%s,%s,%s,%s,%s,%s)", adj)
    adj_by_spec = {s: [a for a in adj if a[3] == s] for s in SPECS}
    print(f"adjusters: {len(adj)} ({sum(a[5] for a in adj)} senior)")

    # ---------------- CUSTOMER, CUSTOMER_PHONE ----------------
    cust, phones = [], []
    cust_city = {}
    for i in range(1, N_CUSTOMERS + 1):
        first, last = fake.first_name(), fake.last_name()
        slug = re.sub(r"[^a-z]", "", (first + last).lower()) or "user"
        city = random.choices(CITIES, weights=CITY_W)[0]
        dob = TODAY - D(ri(21, 75) * 365 + ri(0, 364))
        cust.append((i, f"{first} {last}", dob, f"{slug}{i}@example.com", fake.address().replace("\n", ", ")[:250], city))
        cust_city[i] = city
        seen = set()
        for _ in range(random.choice([1, 1, 2])):
            p = phone()
            if p not in seen:
                seen.add(p)
                phones.append((i, p))
    cur.executemany("INSERT INTO CUSTOMER (customer_id,name,dob,email,address,city) VALUES (%s,%s,%s,%s,%s,%s)", cust)
    cur.executemany("INSERT INTO CUSTOMER_PHONE (customer_id,phone) VALUES (%s,%s)", phones)
    print(f"customers: {len(cust)}, phones: {len(phones)}")

    # ---------------- POLICY + PREMIUM_PAYMENT ----------------
    plans = ["active"] * int(N_POLICIES * 0.85) + ["lapsed"] * int(N_POLICIES * 0.075)
    plans += ["expired"] * (N_POLICIES - len(plans))
    random.shuffle(plans)
    policies = {}
    pol_rows, pay_rows = [], []
    first_failed = {}
    for pid in range(1, N_POLICIES + 1):
        plan = plans[pid - 1]
        tname = random.choices(SPECS, weights=TYPE_W)[0]
        desc, base, (lo, hi) = TYPE_INFO[tname]
        sum_ins = rnd(random.uniform(lo, hi), 10000)
        prem = round(base * random.uniform(0.8, 1.6), 2)
        if plan == "active":
            start = TODAY - D(ri(30, 1000)); end = TODAY + D(ri(60, 700))
            pay_cut = TODAY
        elif plan == "lapsed":
            start = TODAY - D(ri(460, 1000)); end = TODAY + D(ri(30, 400))
            pay_cut = TODAY - D(396)
        else:
            start = TODAY - D(ri(400, 1000)); end = min(start + D(365 * ri(1, 2)), TODAY - D(ri(5, 60)))
            if end <= start + D(30):
                end = start + D(60)
            pay_cut = end
        p = dict(id=pid, cust=ri(1, N_CUSTOMERS), agent=ri(1, N_AGENTS), type=tname, start=start, end=end,
                 sum=sum_ins, prem=prem, plan=plan)
        policies[pid] = p
        pol_rows.append((pid, p["cust"], p["agent"], TYPE_ID[tname], start, end, sum_ins, prem))
        k = 0
        while k == 0 or start + D(365 * k) <= pay_cut:
            d = start + D(365 * k)
            if random.random() < 0.05:  # a failed attempt just before the successful one
                fd = max(start, d - D(ri(1, 5)))
                pay_rows.append((pid, prem, fd, random.choices(["UPI", "CARD", "NETBANKING"], [5, 2, 2])[0], "failed"))
                first_failed.setdefault(pid, fd)
            pay_rows.append((pid, prem, d, random.choices(["UPI", "CARD", "NETBANKING", "CASH"], [55, 20, 20, 5])[0], "success"))
            k += 1
    cur.executemany("INSERT INTO POLICY (policy_id,customer_id,agent_id,type_id,start_date,end_date,sum_insured,premium) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", pol_rows)
    for i in range(0, len(pay_rows), 500):
        cur.executemany("INSERT INTO PREMIUM_PAYMENT (policy_id,payment_no,amount,pay_date,mode,status) VALUES (%s,0,%s,%s,%s,%s)", [r for r in pay_rows[i:i + 500]])
    conn.commit()
    print(f"policies: {len(pol_rows)}, payments: {len(pay_rows)} (failed {sum(r[4] == 'failed' for r in pay_rows)})")

    # ---------------- CLAIMS ----------------
    claims = []  # dicts
    by_cat = {}

    def window(p):
        hi = min(TODAY, p["start"] + D(365)) if p["plan"] == "lapsed" else min(p["end"], TODAY)
        return p["start"], hi

    def pick_adjuster(spec, city, high):
        cand = adj_by_spec[spec]
        if high:
            cand = [a for a in cand if a[5]] or cand
        same = [a for a in cand if a[4] == city]
        return random.choice(same or cand)[0]

    def insert_claim(p, incident, amount, cat, text, fraud, reasons, dup_of=None, claim_id=None, filed=None):
        filed = filed or min(TODAY, incident + D(ri(0, 20)))
        urg = random.choices(*URGENCY_BY_CAT[cat])[0]
        cur.execute(
            "INSERT INTO CLAIM (claim_id,policy_id,incident_date,filed_date,claimed_amount,description_summary,"
            "category,urgency,fraud_score,fraud_reasons,duplicate_of) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (claim_id, p["id"], incident, filed, amount, text[:300], cat, urg, fraud,
             json.dumps(reasons) if reasons else None, dup_of))
        cid = cur.lastrowid if claim_id is None else claim_id
        a = pick_adjuster(p["type"], cust_city.get(p["cust"], "Bengaluru"), fraud >= 0.7)
        c = dict(id=cid, p=p, amount=amount, filed=filed, fraud=fraud, adj=a, cat=cat)
        cur.execute("UPDATE CLAIM SET assigned_adjuster_id=%s, status='under_review' WHERE claim_id=%s", (a, cid))
        narratives[cid] = text
        by_cat.setdefault(cat, []).append(c)
        claims.append(c)
        return c

    def pick_cat(tname):
        return random.choices(CATS_BY_TYPE[tname][0], weights=CATS_BY_TYPE[tname][1])[0]

    all_pol = list(policies.values())
    n_normal = N_CLAIMS - FRAUD_CLAIMS
    for _ in range(n_normal):
        p = random.choice(all_pol)
        lo, hi = window(p)
        incident = lo + D(ri(0, (hi - lo).days))
        cat = pick_cat(p["type"])
        amount = max(2000, rnd(p["sum"] * random.uniform(0.02, 0.6)))
        amount = min(amount, int(p["sum"] * 0.85))
        insert_claim(p, incident, amount, cat, narrative(cat, amount), round(min(random.betavariate(2, 8), 0.55), 3), None)
        labels.append((claims[-1]["id"], 0, ""))
    conn.commit()
    print(f"normal claims: {n_normal}")

    # fraud cluster: 3 claims on one policy inside a year
    cluster_pols = [p for p in all_pol if p["plan"] == "active" and p["start"] <= TODAY - D(160)]
    random.shuffle(cluster_pols)
    n_fraud = 0
    for p in cluster_pols[:40]:
        base = max(p["start"], TODAY - D(400)) + D(ri(0, max(1, (TODAY - D(150) - max(p["start"], TODAY - D(400))).days)))
        for j in range(3):
            incident = min(TODAY, base + D(j * ri(20, 50)))
            cat = pick_cat(p["type"])
            amount = max(2000, rnd(p["sum"] * random.uniform(0.1, 0.35)))
            reasons = [{"feature": "claims_on_policy_last_year", "value": 3, "impact": 0.3,
                        "message": "3 claims filed on this policy within a year"}]
            insert_claim(p, incident, amount, cat, narrative(cat, amount), round(random.uniform(0.65, 0.95), 3), reasons)
            labels.append((claims[-1]["id"], 1, "c"))
            n_fraud += 1

    # single fraud claims with 2-3 engineered signals
    failed_pols = [policies[i] for i in first_failed]
    while n_fraud < FRAUD_CLAIMS:
        sigs = random.sample(["a", "b", "d", "e"], ri(2, 3))
        if "a" in sigs and "e" in sigs:
            sigs.remove("e")
        p = random.choice(failed_pols) if "e" in sigs else random.choice(all_pol)
        lo, hi = window(p)
        if "e" in sigs:
            lo = max(lo, first_failed[p["id"]])
            if lo >= hi:
                sigs.remove("e"); p = random.choice(all_pol); lo, hi = window(p)
        if "a" in sigs:
            hi = min(hi, p["start"] + D(25))
        if hi < lo:
            continue
        incident = lo + D(ri(0, (hi - lo).days))
        cat = pick_cat(p["type"])
        reasons = []
        if "b" in sigs:
            amount = max(2000, rnd(p["sum"] * random.uniform(0.9, 0.99)))
            reasons.append({"feature": "amount_ratio", "value": round(amount / p["sum"], 2), "impact": 0.3,
                            "message": f"Claimed amount is {int(100 * amount / p['sum'])}% of the sum insured"})
        else:
            amount = max(2000, rnd(p["sum"] * random.uniform(0.1, 0.6)))
        text, dup_of = narrative(cat, amount), None
        if "d" in sigs and by_cat.get(cat):
            src = random.choice(by_cat[cat])
            if src["p"]["cust"] != p["cust"]:
                text, dup_of = reword(narratives[src["id"]]), src["id"]
                reasons.append({"feature": "max_similarity", "value": 0.9, "impact": 0.25,
                                "message": f"Narrative is very similar to claim #{src['id']}"})
            else:
                sigs.remove("d")
        elif "d" in sigs:
            sigs.remove("d")
        if "a" in sigs:
            reasons.append({"feature": "days_policy_to_claim", "value": (incident - p["start"]).days, "impact": 0.3,
                            "message": f"Claim filed {(incident - p['start']).days} days after policy start"})
        if "e" in sigs:
            reasons.append({"feature": "premium_payments_missed", "value": 1, "impact": 0.2,
                            "message": "A premium payment failed before this claim"})
        if not sigs:
            continue
        insert_claim(p, incident, amount, cat, text, round(random.uniform(0.62, 0.97), 3), reasons[:3], dup_of)
        labels.append((claims[-1]["id"], 1, "".join(sigs)))
        n_fraud += 1
    conn.commit()
    print(f"fraud claims: {n_fraud}  total claims: {len(claims)}")

    # ---------------- ASSESSMENT + SETTLEMENT ----------------
    settled_by_policy = {}
    n_assessed = n_settled = 0
    for c in claims:
        old = c["filed"] < TODAY - D(20)
        if random.random() > (0.75 if old else 0.15):
            continue
        if c["fraud"] >= 0.62 and c["fraud"] > 0.5:
            dec = random.choices(["approve", "reject", "request_info"], [35, 40, 25])[0]
        else:
            dec = random.choices(["approve", "reject", "request_info"], [80, 12, 8])[0]
        approved = rnd(c["amount"] * random.uniform(0.6, 1.0)) if dec == "approve" else 0
        approved = min(approved, int(c["amount"]))
        review = dt.datetime.combine(min(TODAY, c["filed"] + D(ri(1, 10))), dt.time(10, 30))
        cur.execute("INSERT INTO ASSESSMENT (claim_id,adjuster_id,decision,approved_amount,remarks,review_date) VALUES (%s,%s,%s,%s,%s,%s)",
                    (c["id"], c["adj"], dec, approved, "Seeded assessment", review))
        n_assessed += 1
        pid = c["p"]["id"]
        if dec == "approve" and approved > 0 and old and random.random() < 0.9:
            if settled_by_policy.get(pid, 0) + approved <= c["p"]["sum"]:
                sdate = min(TODAY, review.date() + D(ri(1, 15)))
                cur.execute("INSERT INTO SETTLEMENT (claim_id,amount,settle_date,mode) VALUES (%s,%s,%s,%s)",
                            (c["id"], approved, sdate, random.choices(["NEFT", "UPI", "CHEQUE"], [60, 30, 10])[0]))
                settled_by_policy[pid] = settled_by_policy.get(pid, 0) + approved
                n_settled += 1
    conn.commit()
    print(f"assessments: {n_assessed} ({100 * n_assessed // len(claims)}%)  settlements: {n_settled} ({100 * n_settled // len(claims)}%)")

    # ---------------- DEMO FIXTURES (fixed IDs) ----------------
    cur.executemany("INSERT INTO CUSTOMER (customer_id,name,dob,email,address,city) VALUES (%s,%s,%s,%s,%s,%s)", [
        (2001, "Priya Sharma", dt.date(1992, 4, 12), "priya@demo.in", "12 MG Road, Bengaluru", "Bengaluru"),
        (2002, "Arjun Rao", dt.date(1985, 9, 3), "arjun@demo.in", "44 Indiranagar, Bengaluru", "Bengaluru")])
    cur.executemany("INSERT INTO CUSTOMER_PHONE (customer_id,phone) VALUES (%s,%s)", [(2001, "9845012345"), (2002, "9845067890")])
    cust_city[2001] = cust_city[2002] = "Bengaluru"

    def fixture_policy(pid, cust_id, tname, start, end, sum_ins, prem):
        cur.execute("INSERT INTO POLICY (policy_id,customer_id,agent_id,type_id,start_date,end_date,sum_insured,premium) VALUES (%s,%s,1,%s,%s,%s,%s,%s)",
                    (pid, cust_id, TYPE_ID[tname], start, end, sum_ins, prem))
        cur.execute("INSERT INTO PREMIUM_PAYMENT (policy_id,payment_no,amount,pay_date,mode) VALUES (%s,0,%s,%s,'UPI')", (pid, prem, start))
        return dict(id=pid, cust=cust_id, type=tname, start=start, end=end, sum=sum_ins, prem=prem, plan="active")

    p9001 = fixture_policy(9001, 2001, "motor", TODAY - D(200), TODAY + D(165), 200000, 9000)
    p9002 = fixture_policy(9002, 2001, "motor", TODAY - D(600), TODAY + D(130), 150000, 8500)
    p9003 = fixture_policy(9003, 2002, "health", TODAY - D(250), TODAY + D(115), 100000, 12000)

    def fixture_claim(cid, p, incident_ago, amount, cat, text, fraud, adj_id, decision, approved, settle_ago=None):
        incident = TODAY - D(incident_ago)
        filed = incident + D(1)
        cur.execute("INSERT INTO CLAIM (claim_id,policy_id,incident_date,filed_date,claimed_amount,description_summary,category,urgency,fraud_score) VALUES (%s,%s,%s,%s,%s,%s,%s,'medium',%s)",
                    (cid, p["id"], incident, filed, amount, text[:300], cat, fraud))
        cur.execute("UPDATE CLAIM SET assigned_adjuster_id=%s, status='under_review' WHERE claim_id=%s", (adj_id, cid))
        cur.execute("INSERT INTO ASSESSMENT (claim_id,adjuster_id,decision,approved_amount,remarks,review_date) VALUES (%s,%s,%s,%s,'Demo fixture',%s)",
                    (cid, adj_id, decision, approved, dt.datetime.combine(filed + D(2), dt.time(11, 0))))
        if settle_ago is not None:
            cur.execute("INSERT INTO SETTLEMENT (claim_id,amount,settle_date,mode) VALUES (%s,%s,%s,'NEFT')", (cid, approved, TODAY - D(settle_ago)))
        narratives[cid] = text

    fixture_claim(9101, p9001, 45, 28000, "accident",
                  "My bike skidded on the wet road on Outer Ring Road near Marathahalli and I fell. The front fork and headlight are damaged. "
                  "The workshop bill is Rs 28,000 and the FIR copy is attached.", 0.12, 1, "approve", 25000, settle_ago=30)
    fixture_claim(9103, p9003, 120, 90000, "hospitalisation",
                  "I was admitted to Manipal Hospital for appendicitis for 4 days. The total bill is Rs 90,000 and I have the discharge summary.",
                  0.15, 2, "approve", 80000, settle_ago=90)
    fixture_claim(9102, p9003, 20, 60000, "hospitalisation",
                  "My knee needed surgery after a fall and I was admitted to Fortis Hospital for 3 days. The bill is Rs 60,000.",
                  0.25, 2, "approve", 40000)
    cur.execute("UPDATE POLICY SET status='lapsed' WHERE policy_id=9002")
    conn.commit()

    # ---------------- lapse / expire the planned 15% ----------------
    cur.executemany("UPDATE POLICY SET status=%s WHERE policy_id=%s",
                    [(p["plan"], p["id"]) for p in policies.values() if p["plan"] != "active"])
    conn.commit()

    # ---------------- APP_USER ----------------
    users = [("priya@demo.in", "customer", 2001, None, None), ("arjun@demo.in", "customer", 2002, None, None),
             ("ramesh@demo.in", "adjuster", None, None, 1), ("kavitha@demo.in", "adjuster", None, None, 2),
             ("suresh@demo.in", "agent", None, 1, None), ("admin@demo.in", "admin", None, None, None)]
    users += [(cust[i][3], "customer", i + 1, None, None) for i in range(50)]
    cur.executemany("INSERT INTO APP_USER (email,password_hash,role,customer_id,agent_id,adjuster_id) VALUES (%s,%s,%s,%s,%s,%s)",
                    [(e, pw_hash, r, c, a, j) for e, r, c, a, j in users])
    conn.commit()
    print(f"app users: {len(users)}  (password Demo@123)")

    # ---------------- labels CSV + Mongo narratives ----------------
    out = ROOT / "ml" / "data"
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "claims_labeled.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["claim_id", "is_fraud", "signals"])
        w.writerows(labels)
    print(f"wrote {out / 'claims_labeled.csv'} ({len(labels)} rows, {sum(l[1] for l in labels)} fraud)")

    try:
        from pymongo import MongoClient
        mc = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
        mdb = mc[MONGO_DB]
        mdb.claim_narratives.delete_many({})
        now = dt.datetime.utcnow()
        docs = [{"claim_id": cid, "original_text": t, "language": "en", "created_at": now} for cid, t in narratives.items()]
        for i in range(0, len(docs), 1000):
            mdb.claim_narratives.insert_many(docs[i:i + 1000])
        for coll in ("claim_narratives", "claim_documents", "fraud_explanations"):
            mdb[coll].create_index("claim_id")
        print(f"mongo: {len(docs)} narratives")
    except Exception as e:  # Mongo optional for the SQL side
        print(f"WARNING: Mongo not seeded ({e.__class__.__name__}). Start it and re-run, or ignore for now.")

    cur.close(); conn.close()
    print("seed complete")


if __name__ == "__main__":
    sys.exit(main())
