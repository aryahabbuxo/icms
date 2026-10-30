// Mock-mode stand-in for the backend's claim pipeline. It mirrors the MySQL triggers' error codes
// and gives the language-model fields plausible values, so the full demo flow works before the API exists.
import toast from "react-hot-toast";
import { mockClaimDetail, mockClaimResult, mockClaims, mockPolicies } from "./mocks";

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
  const dup = /pothole/i.test(text) && /outer ring road/i.test(text);
  const ratio = body.claimed_amount / policy.sum_insured;
  const score = Math.min(0.97, 0.12 + (dup ? 0.55 : 0) + (ratio > 0.4 ? 0.22 : 0) + Math.random() * 0.06);
  const reasons = [
    dup && { feature: "max_similarity", value: 0.91, impact: 0.55, message: "Narrative is 91% similar to claim #9101" },
    ratio > 0.4 && { feature: "amount_ratio", value: ratio, impact: 0.3, message: `Claimed amount is ${Math.round(ratio * 100)}% of the sum insured` },
    { feature: "days_incident_to_filing", value: 1, impact: 0.15, message: "Reported 1 day after the incident" },
  ].filter(Boolean).slice(0, 3);
  const total = reasons.reduce((s, r) => s + r.impact, 0);

  const result = {
    claim_id: nextClaimId++, status: "under_review", nlp,
    fraud: { score: +score.toFixed(2), level: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
      reasons: reasons.map((r) => ({ ...r, impact: +(r.impact / total).toFixed(2) })) },
    duplicate: { is_duplicate: dup, similar_claim_id: dup ? 9101 : null, similarity: dup ? 0.91 : 0.38 },
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

// ---- claim detail: merge list rows, freshly filed claims and the rich 5012 example
const filed = {};

export function rememberFiled(body, res) {
  const now = new Date().toISOString().slice(0, 19);
  filed[res.claim_id] = {
    ...mockClaimDetail, claim_id: res.claim_id, policy_id: +body.policy_id, status: res.status,
    category: res.nlp.category, urgency: res.nlp.urgency, claimed_amount: body.claimed_amount,
    incident_date: body.incident_date, filed_date: now.slice(0, 10), fraud_score: res.fraud.score,
    adjuster_name: res.assigned_adjuster?.name, documents: [], settlement: null, fraud: res.fraud, duplicate: res.duplicate,
    narrative: { original_text: body.narrative, language: body.language, nlp: res.nlp },
    timeline: [
      { log_no: 1, old_status: null, new_status: "filed", changed_at: now, changed_by: "priya@demo.in", curr_hash: Math.random().toString(16).slice(2, 14) },
      { log_no: 2, old_status: "filed", new_status: "under_review", changed_at: now, changed_by: "system", curr_hash: Math.random().toString(16).slice(2, 14) },
    ],
  };
}

export function claimDetail(id) {
  if (filed[id]) return filed[id];
  const row = mockClaims.find((c) => c.claim_id === +id);
  if (!row || row.claim_id === mockClaimDetail.claim_id) return { ...mockClaimDetail, claim_id: +id };
  const tl = [...mockClaimDetail.timeline];
  if (["approved", "settled"].includes(row.status)) tl.push({ log_no: 3, old_status: "under_review", new_status: "approved", changed_at: row.filed_date + "T16:40:00", changed_by: row.adjuster_name, curr_hash: "c41e09b2d7aa" });
  if (row.status === "settled") tl.push({ log_no: 4, old_status: "approved", new_status: "settled", changed_at: row.filed_date + "T18:05:00", changed_by: "admin@demo.in", curr_hash: "7d2f88e1a034" });
  const story = row.category === "hospitalisation"
    ? "I was admitted to Manipal Hospital with dengue fever and stayed for 6 days. The hospital bill came to Rs 1,26,000. All discharge papers and bills are attached."
    : "My bike skidded on a pothole near Outer Ring Road and I fell on the road. The vehicle is badly damaged and the garage estimate for repair is Rs 48,000. Please process this soon.";
  return {
    ...mockClaimDetail, ...row, timeline: tl.map((t) => ({ ...t, changed_at: t.changed_at.startsWith("2026-10-22") ? row.filed_date + t.changed_at.slice(10) : t.changed_at })),
    narrative: { original_text: story, language: "en", nlp: { ...mockClaimDetail.narrative.nlp, entities: row.category === "hospitalisation"
      ? [{ text: "Manipal Hospital", label: "HOSPITAL" }, { text: "Rs 1,26,000", label: "MONEY" }]
      : [{ text: "Outer Ring Road", label: "LOC" }, { text: "Rs 48,000", label: "MONEY" }] } },
    documents: [{ doc_type: "bill", filename: row.category === "hospitalisation" ? "discharge_bill.pdf" : "garage_invoice.jpg" }],
    settlement: row.status === "settled" ? { amount: 42000, settle_date: "2026-09-18", mode: "NEFT" } : null,
  };
}
