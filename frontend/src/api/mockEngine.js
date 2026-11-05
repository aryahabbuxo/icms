// Mock-mode stand-in for the backend's claim pipeline. It mirrors the MySQL triggers' error codes
// and gives the language-model fields plausible values, so the full demo flow works before the API exists.
import toast from "react-hot-toast";
import { mockClaimDetail, mockClaimResult, mockClaims, mockPolicies, mockQueue } from "./mocks";

let nextClaimId = 5013;

export function mockFail(code, message, ms = 900) {
  return new Promise((_, reject) => setTimeout(() => {
    toast.error(message, { id: code });        // same toast the real axios interceptor shows
    reject({ code, message });
  }, ms));
}

const RULES = [
  ["death", /\b(died|passed away|expired|death|demise|nominee)\b/i],
  ["accident", /\b(hit by|hit|collision|accident|skid|skidded|rammed|crash|pothole|slipped)\b/i],
  ["hospitalisation", /\b(hospital|admitted|icu|surgery|fever|dengue|treatment)\b/i],
  ["theft", /\b(stolen|theft|snatched|burglary|broke into|missing)\b/i],
  ["fire", /\b(fire|burnt|burned|short circuit|cylinder)\b/i],
  ["flood", /\b(flood|flooded|submerged|water entered|rain)\b/i],
  ["travel_loss", /\b(flight|baggage|airline|passport|trip)\b/i],
];

// Kannada / Hindi keywords (JS \b does not work on these scripts, so they are matched separately)
const NATIVE = [["theft", /ಕಳ್ಳ|चोरी/], ["flood", /ಮಳೆ|ನೀರು|बारिश|पानी|बाढ़/], ["hospitalisation", /ಆಸ್ಪತ್ರೆ|अस्पताल/], ["accident", /ಅಪಘಾತ|दुर्घटना/]];

function classify(text) {
  const hit = NATIVE.find(([, re]) => re.test(text)) || RULES.find(([, re]) => re.test(text));
  const critical = /\b(icu|died|passed away|unconscious|burn injuries)\b/i.test(text);
  const high = /\b(fracture|injur|hurt|admitted|surgery|hospital)\w*/i.test(text);
  return {
    category: hit ? hit[0] : "other",
    urgency: critical ? "critical" : high ? "high" : hit ? "medium" : "low",
    confidence: hit ? 0.86 + Math.random() * 0.1 : 0.48,
  };
}

function entities(text) {
  const out = [];
  const add = (re, label) => { for (const m of text.matchAll(re)) out.push({ text: m[0].trim(), label }); };
  add(/\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,2}[ -]?\d{4}\b/g, "VEHICLE_NO");
  add(/(?:Rs\.?\s?|₹)\s?[\d,]+|\b[\d,]{4,}\s?rupees\b/gi, "MONEY");
  add(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s(?:Hospital|Health)\b/g, "HOSPITAL");
  add(/\b\d{1,2}\s(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g, "DATE");
  add(/\b(?:Silk Board(?: junction)?|Outer Ring Road|Hosur Road|Koramangala|Indiranagar|Jayanagar|Whitefield|Bellandur|HSR Layout|Hebbal|Bengaluru)\b/g, "LOC");
  return out.filter((e, i, a) => a.findIndex((x) => x.text === e.text) === i).slice(0, 8);
}

export function simulateFileClaim(body) {
  const policy = mockPolicies.find((p) => p.policy_id === +body.policy_id);
  if (!policy || policy.status !== "active")
    return mockFail("POLICY_INACTIVE", "Claims can only be filed on active policies");
  if (+body.claimed_amount > policy.sum_insured)
    return mockFail("OVER_SUM_INSURED", "Claimed amount exceeds the sum insured");
  if (body.incident_date > new Date().toISOString().slice(0, 10))
    return mockFail("INCIDENT_OUT_OF_COVER", "Incident date is outside the policy period");

  const text = body.narrative || "";
  const nlp = { ...classify(text), entities: entities(text) };
  const dup = /outer ring road/i.test(text) && /(pothole|marathahalli)/i.test(text) && /(slipped|two-wheeler|reworded|regarding my claim)/i.test(text);
  const ratio = body.claimed_amount / policy.sum_insured;
  const score = Math.min(0.97, 0.12 + (dup ? 0.6 : 0) + (ratio > 0.4 ? 0.22 : 0) + Math.random() * 0.06);
  const reasons = [
    dup && { feature: "max_similarity", value: 0.81, impact: 0.55, message: "Description is 81% similar to an earlier claim" },
    ratio > 0.4 && { feature: "amount_ratio", value: ratio, impact: 0.3, message: `Claimed amount is ${Math.round(ratio * 100)}% of the sum insured` },
    { feature: "days_incident_to_filing", value: 1, impact: 0.15, message: "Reported 1 day after the incident" },
  ].filter(Boolean).slice(0, 3);
  const total = reasons.reduce((s, r) => s + r.impact, 0);

  const result = {
    claim_id: nextClaimId++, status: "under_review", nlp,
    fraud: { score: +score.toFixed(2), level: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
      reasons: reasons.map((r) => ({ ...r, impact: +(r.impact / total).toFixed(2) })) },
    duplicate: { is_duplicate: dup, similar_claim_id: dup ? 9101 : null, similarity: dup ? 0.81 : 0.33 },
    assigned_adjuster: score >= 0.7 ? { adjuster_id: 8, name: "Kavitha R" } : { adjuster_id: 7, name: "Ramesh K" },
  };
  const out = { ...mockClaimResult, ...result };
  rememberFiled(body, out);
  return new Promise((r) => setTimeout(() => r(structuredClone(out)), 1400));
}

const PAYMENTS = {
  9001: [
    { payment_no: 1, amount: 9800, pay_date: "2025-11-12", mode: "UPI", status: "success" },
    { payment_no: 2, amount: 9800, pay_date: "2025-11-12", mode: "CARD", status: "failed" },
  ],
  9002: [{ payment_no: 1, amount: 8200, pay_date: "2024-06-01", mode: "NETBANKING", status: "success" }],
  9004: [{ payment_no: 1, amount: 18500, pay_date: "2026-01-15", mode: "UPI", status: "success" }],
};

export function policyDetail(id, claims) {
  const p = mockPolicies.find((x) => x.policy_id === +id) || mockPolicies[0];
  return {
    ...p,
    coverage_desc: {
      motor: "Own damage, theft and third-party liability for your two-wheeler, with personal accident cover for the rider.",
      health: "Hospitalisation, day-care procedures and pre- and post-hospital expenses for the insured family.",
    }[p.type_name] || "Cover as per policy wording.",
    payments: (PAYMENTS[p.policy_id] || []).slice().reverse(),
    claims: claims.filter((c) => c.policy_id === p.policy_id),
  };
}

// ---- claim detail + adjuster actions. One in-memory store, so a claim Priya files appears in the
// adjuster's queue and an approval shows up on her claim page (until the page is reloaded).
const store = {};
const hash = () => Array.from({ length: 12 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const nowIso = () => new Date().toISOString().slice(0, 19);

const STORIES = {
  4870: ["I was admitted to Manipal Hospital with dengue fever and stayed for 6 days. The hospital bill came to Rs 1,26,000. All discharge papers and bills are attached.",
    [["Manipal Hospital", "HOSPITAL"], ["Rs 1,26,000", "MONEY"]]],
  9101: ["My bike skidded on the wet road on Outer Ring Road near Marathahalli and I fell. The front fork and headlight are damaged. The workshop bill is Rs 28,000 and the FIR copy is attached.",
    [["Outer Ring Road", "LOC"], ["Marathahalli", "LOC"], ["Rs 28,000", "MONEY"]]],
  5009: ["My Pulsar KA 03 HJ 7781 was stolen from the basement parking of our apartment in HSR Layout. An FIR has been filed at HSR Layout police station. The total value is around Rs 64000.",
    [["KA 03 HJ 7781", "VEHICLE_NO"], ["HSR Layout", "LOC"], ["Rs 64000", "MONEY"]]],
  5007: ["A water tanker rammed into my Creta on Hosur Road on 19 October. My father was in the car and was taken to the ICU at Narayana Health. Garage estimate is Rs 1,42,000.",
    [["Creta", "ORG"], ["Hosur Road", "LOC"], ["19 October", "DATE"], ["Narayana Health", "HOSPITAL"], ["Rs 1,42,000", "MONEY"]]],
  5004: ["Heavy rain flooded the basement in Bellandur and my Swift was submerged for a day. The engine does not start. Repair estimate is Rs 96000.",
    [["Bellandur", "LOC"], ["Rs 96000", "MONEY"]]],
  5001: ["Minor collision with an auto-rickshaw at KR Puram signal. The side mirror and door are damaged. Repair quote is Rs 12,500.",
    [["KR Puram signal", "LOC"], ["Rs 12,500", "MONEY"]]],
  4996: ["Two men on a bike snatched my phone near Majestic bus stand around 9 pm. FIR filed at Upparpet police station. Phone cost Rs 38000.",
    [["Majestic", "LOC"], ["Rs 38000", "MONEY"]]],
};
const REASONS = {
  5009: [{ feature: "max_similarity", value: 0.88, impact: 0.46, message: "Description is 88% similar to an earlier claim" },
         { feature: "days_incident_to_filing", value: 23, impact: 0.31, message: "Reported 23 days after the incident" },
         { feature: "premium_payments_missed", value: 2, impact: 0.23, message: "2 premium payments failed before this claim" }],
  5007: [{ feature: "amount_ratio", value: 0.71, impact: 0.62, message: "Claimed amount is 71% of the sum insured" },
         { feature: "claims_on_policy_last_year", value: 1, impact: 0.38, message: "1 other claim on this policy in the last 12 months" }],
};

function build(id) {
  const row = mockQueue.find((c) => c.claim_id === +id) || mockClaims.find((c) => c.claim_id === +id);
  if (!row || row.claim_id === mockClaimDetail.claim_id) return structuredClone({ ...mockClaimDetail, claim_id: +id });
  const [story, ents] = STORIES[row.claim_id] || STORIES[9101];
  const tl = structuredClone(mockClaimDetail.timeline).map((t) => ({ ...t, changed_at: row.filed_date + t.changed_at.slice(10) }));
  if (row.status === "info_requested") tl.push({ log_no: 3, old_status: "under_review", new_status: "info_requested", changed_at: row.filed_date + "T17:20:00", changed_by: "ramesh@demo.in", curr_hash: hash() });
  if (["approved", "settled"].includes(row.status)) tl.push({ log_no: 3, old_status: "under_review", new_status: "approved", changed_at: row.filed_date + "T16:40:00", changed_by: row.adjuster_name, curr_hash: "c41e09b2d7aa" });
  if (row.status === "settled") tl.push({ log_no: 4, old_status: "approved", new_status: "settled", changed_at: row.filed_date + "T18:05:00", changed_by: "admin@demo.in", curr_hash: "7d2f88e1a034" });
  const score = row.fraud_score ?? 0.2;
  const policy = mockPolicies.find((p) => p.policy_id === row.policy_id) || { policy_id: row.policy_id, type_name: row.policy_type, sum_insured: 200000, status: "active", start_date: "2025-03-01" };
  return {
    ...structuredClone(mockClaimDetail), ...row, policy, customer: { name: row.customer_name || "Priya Sharma", city: row.city || "Bengaluru" },
    timeline: tl,
    narrative: { original_text: story, language: "en", nlp: { category: row.category, urgency: row.urgency, confidence: 0.9, entities: ents.map(([text, label]) => ({ text, label })) } },
    documents: [{ doc_type: "bill", filename: row.category === "hospitalisation" ? "discharge_bill.pdf" : "garage_invoice.jpg",
                  ocr_text: row.category === "hospitalisation" ? "MANIPAL HOSPITAL ... NET PAYABLE 1,26,000" : `ESTIMATE ... TOTAL ${row.claimed_amount}` }],
    fraud: { score, level: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low", reasons: score >= 0.4 ? REASONS[row.claim_id] || [] : [] },
    duplicate: row.duplicate_of ? { is_duplicate: true, similar_claim_id: row.duplicate_of, similarity: 0.88 } : { is_duplicate: false, similar_claim_id: null, similarity: 0.31 },
    assessments: [], settlement: row.status === "settled" ? { amount: 42000, settle_date: "2026-09-18", mode: "NEFT" } : null,
  };
}

export function rememberFiled(body, res) {
  const now = nowIso();
  const policy = mockPolicies.find((p) => p.policy_id === +body.policy_id);
  store[res.claim_id] = {
    ...structuredClone(mockClaimDetail), claim_id: res.claim_id, policy_id: +body.policy_id, policy, policy_type: policy?.type_name,
    status: res.status, category: res.nlp.category, urgency: res.nlp.urgency, claimed_amount: body.claimed_amount,
    incident_date: body.incident_date, filed_date: now.slice(0, 10), fraud_score: res.fraud.score,
    adjuster_name: res.assigned_adjuster?.name, assigned_adjuster_id: res.assigned_adjuster?.adjuster_id,
    customer_name: "Priya Sharma", city: "Bengaluru", customer: { name: "Priya Sharma", city: "Bengaluru" },
    duplicate_of: res.duplicate.similar_claim_id, documents: [], settlement: null, assessments: [], fraud: res.fraud, duplicate: res.duplicate,
    narrative: { original_text: body.narrative, language: body.language, nlp: res.nlp },
    timeline: [
      { log_no: 1, old_status: null, new_status: "filed", changed_at: now, changed_by: "priya@demo.in", curr_hash: hash() },
      { log_no: 2, old_status: "filed", new_status: "under_review", changed_at: now, changed_by: "system", curr_hash: hash() },
    ],
  };
}

export function claimDetail(id) {
  store[id] ??= build(id);
  return store[id];
}

export function claimsList() {
  const fresh = Object.values(store).filter((c) => !mockClaims.some((m) => m.claim_id === c.claim_id) && c.customer_name === "Priya Sharma");
  return [...fresh, ...mockClaims.map((c) => ({ ...c, status: store[c.claim_id]?.status ?? c.status }))];
}

export function queue() {
  const ids = new Set(mockQueue.map((c) => c.claim_id));
  const fresh = Object.values(store).filter((c) => !ids.has(c.claim_id) && !mockClaims.some((m) => m.claim_id === c.claim_id));
  return [...fresh, ...mockQueue].map((c) => ({ ...c, status: store[c.claim_id]?.status ?? c.status }))
    .filter((c) => ["under_review", "info_requested"].includes(c.status));
}

export function simulateAssess(id, body) {
  const user = JSON.parse(localStorage.getItem("icms_user") || "{}");
  const c = claimDetail(id);
  if (body.decision === "approve" && Number(body.approved_amount) > Number(c.claimed_amount))
    return mockFail("OVER_CLAIMED", "Approved amount exceeds claimed amount");
  if (body.decision === "approve" && (c.fraud_score ?? 0) >= 0.7 && !user.is_senior)
    return mockFail("SENIOR_REQUIRED", "High-risk claims must be approved by a senior adjuster");
  const status = { approve: "approved", reject: "rejected", request_info: "info_requested" }[body.decision];
  c.assessments = [...(c.assessments || []), { adjuster_name: user.name, decision: body.decision,
    approved_amount: body.decision === "approve" ? Number(body.approved_amount) : 0, remarks: body.remarks, review_date: nowIso() }];
  c.timeline = [...c.timeline, { log_no: c.timeline.length + 1, old_status: c.status, new_status: status, changed_at: nowIso(), changed_by: user.email || user.name, curr_hash: hash() }];
  c.status = status;
  return new Promise((r) => setTimeout(() => r({ claim_id: +id, status }), 700));
}

// ---- admin: all claims, settlement (mirrors trg_settle_validate), NL questions, audit chain
const ARJUN = {
  claim_id: 9102, policy_id: 9003, policy_type: "health", category: "hospitalisation", urgency: "high", status: "approved",
  claimed_amount: 52000, fraud_score: 0.18, filed_date: "2026-10-12", incident_date: "2026-10-08",
  customer_name: "Arjun Rao", city: "Bengaluru", adjuster_name: "Kavitha R", duplicate_of: null,
  approved_amount: 40000, sum_insured: 100000, settled_on_policy: 80000,
};
const EXTRA = [
  ARJUN,
  { claim_id: 4950, policy_id: 7410, policy_type: "property", category: "fire", urgency: "high", status: "settled", claimed_amount: 210000, fraud_score: 0.21, filed_date: "2026-10-02", customer_name: "Deepa Menon", city: "Mangaluru", adjuster_name: "Vikram S" },
  { claim_id: 4931, policy_id: 7390, policy_type: "travel", category: "travel_loss", urgency: "low", status: "rejected", claimed_amount: 45000, fraud_score: 0.74, filed_date: "2026-09-27", customer_name: "Nikhil Jain", city: "Pune", adjuster_name: "Kavitha R" },
];

export function adminClaims() {
  const seen = new Set();
  const rows = [...queue(), ...claimsList().map((c) => ({ customer_name: "Priya Sharma", city: "Bengaluru", ...c })), ...mockQueue, ...EXTRA]
    .filter((c) => !seen.has(c.claim_id) && seen.add(c.claim_id))
    .map((c) => ({ ...c, status: store[c.claim_id]?.status ?? c.status,
                   approved_amount: store[c.claim_id]?.assessments?.at(-1)?.approved_amount ?? c.approved_amount ?? c.claimed_amount }));
  return rows.sort((a, b) => b.claim_id - a.claim_id);
}

export function simulateSettle(id, body) {
  const c = adminClaims().find((x) => x.claim_id === +id);
  const amt = Number(body.amount);
  if (!c || c.status !== "approved") return mockFail("NOT_APPROVED", "Only approved claims can be settled");
  if (amt > c.approved_amount) return mockFail("OVER_APPROVED", "Settlement exceeds the approved amount");
  const sum = c.sum_insured ?? store[id]?.policy?.sum_insured ?? 200000;
  const already = c.settled_on_policy ?? store[id]?.policy?.total_settled ?? 0;
  if (already + amt > sum) return mockFail("SUM_INSURED_EXHAUSTED", "Total settlements would exceed the sum insured");
  const d = claimDetail(id);
  d.status = "settled";
  d.settlement = { amount: amt, settle_date: nowIso().slice(0, 10), mode: body.mode };
  d.timeline = [...d.timeline, { log_no: d.timeline.length + 1, old_status: "approved", new_status: "settled", changed_at: nowIso(), changed_by: "admin@demo.in", curr_hash: hash() }];
  if (c === ARJUN || c.claim_id === 9102) ARJUN.status = "settled";
  return new Promise((r) => setTimeout(() => r({ claim_id: +id, status: "settled", settlement_id: 3001 }), 800));
}

const NLQ = [
  { match: /cit(y|ies).*(fraud|risk)|(fraud|risk).*cit(y|ies)/i,
    sql: "SELECT city, COUNT(*) AS high_risk_claims\nFROM v_claim_dashboard\nWHERE fraud_score >= 0.7 AND YEAR(filed_date) = YEAR(CURDATE())\nGROUP BY city\nORDER BY high_risk_claims DESC\nLIMIT 5",
    columns: ["city", "high_risk_claims"], rows: [["Bengaluru", 41], ["Mysuru", 22], ["Chennai", 17], ["Hyderabad", 13], ["Pune", 9]], chart_hint: "bar" },
  { match: /month/i,
    sql: "SELECT DATE_FORMAT(filed_date, '%b %Y') AS month, COUNT(*) AS claims\nFROM CLAIM\nWHERE filed_date >= CURDATE() - INTERVAL 6 MONTH\nGROUP BY YEAR(filed_date), MONTH(filed_date), month\nORDER BY YEAR(filed_date), MONTH(filed_date)",
    columns: ["month", "claims"], rows: [["May 2026", 420], ["Jun 2026", 455], ["Jul 2026", 470], ["Aug 2026", 438], ["Sep 2026", 492], ["Oct 2026", 519]], chart_hint: "line" },
  { match: /(days|time).*settle|settle.*(days|time)/i,
    sql: "SELECT policy_type, ROUND(AVG(days_to_settle), 1) AS avg_days_to_settle\nFROM v_claim_dashboard\nWHERE settle_date IS NOT NULL\nGROUP BY policy_type\nORDER BY avg_days_to_settle DESC",
    columns: ["policy_type", "avg_days_to_settle"], rows: [["property", 18.4], ["health", 12.1], ["motor", 9.8], ["travel", 7.2], ["life", 21.5]], chart_hint: "bar" },
  { match: /adjuster/i,
    sql: "SELECT name, open_claims\nFROM v_adjuster_workload\nORDER BY open_claims DESC\nLIMIT 5",
    columns: ["name", "open_claims"], rows: [["Kavitha R", 18], ["Ramesh K", 15], ["Meera N", 12], ["Vikram S", 9], ["Arun P", 7]], chart_hint: "bar" },
  { match: /pending|open|waiting/i,
    sql: "SELECT COUNT(*) AS pending_claims\nFROM CLAIM c JOIN POLICY p ON p.policy_id = c.policy_id\nJOIN CUSTOMER cu ON cu.customer_id = p.customer_id\nWHERE c.status IN ('filed', 'under_review', 'info_requested')\n  AND cu.city = 'Bengaluru'",
    columns: ["pending_claims"], rows: [[268]], chart_hint: "table" },
  { match: /settled|paid|category|type/i,
    sql: "SELECT c.category, SUM(s.amount) AS total_settled\nFROM SETTLEMENT s JOIN CLAIM c ON c.claim_id = s.claim_id\nGROUP BY c.category\nORDER BY total_settled DESC",
    columns: ["category", "total_settled"], rows: [["hospitalisation", 18450000], ["accident", 9620000], ["fire", 7310000], ["flood", 4980000], ["theft", 3120000], ["travel_loss", 940000]], chart_hint: "bar" },
];

export function simulateNl(question) {
  if (/\b(delete|drop|update|insert|truncate|alter|grant|password)\b/i.test(question))
    return mockFail("UNSAFE_QUERY", "Only questions that read data are allowed. This request would change or expose protected data.", 700);
  const hit = NLQ.find((q) => q.match.test(question));
  if (!hit) return mockFail("NO_ANSWER", "I couldn't turn that into a query. Try one of the suggested questions.", 900);
  const { match, ...res } = hit; // eslint-disable-line no-unused-vars
  return new Promise((r) => setTimeout(() => r(structuredClone(res)), 1100));
}

export function verifyChainMock(id) {
  const d = claimDetail(id);
  const rows = (d.timeline || []).map((t) => ({ log_no: t.log_no, old_status: t.old_status, new_status: t.new_status, changed_at: t.changed_at, changed_by: t.changed_by, ok: true, stored_hash: t.curr_hash }));
  if (+id === 5012 && rows.length >= 2) {   // demo: pretend someone edited log row 2 directly in MySQL
    const broken = rows.length >= 3 ? 3 : 2;
    rows.forEach((r) => { if (r.log_no >= broken) r.ok = r.log_no === broken ? false : true; });
    const r = rows.find((x) => x.log_no === broken);
    r.new_status = "approved"; r.recomputed_hash = "a07e3d41c95b"; r.stored_hash = "9f1c2b77e0aa";
    return { claim_id: +id, valid: false, checked: rows.length, broken_at_log_no: broken, rows };
  }
  return { claim_id: +id, valid: true, checked: rows.length, broken_at_log_no: null, rows };
}
