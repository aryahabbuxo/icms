// Mock responses. Every shape here matches the Shared Spec API contract exactly.
// If the real backend ever returns something different, the contract is broken: fix the doc first.

export const demoUsers = {
  "priya@demo.in":   { user_id: 4, role: "customer", name: "Priya Sharma", customer_id: 12 },
  "ramesh@demo.in":  { user_id: 7, role: "adjuster", name: "Ramesh K", adjuster_id: 7 },
  "kavitha@demo.in": { user_id: 8, role: "adjuster", name: "Kavitha R", adjuster_id: 8 },
  "admin@demo.in":   { user_id: 1, role: "admin", name: "Admin" },
  "suresh@demo.in":  { user_id: 9, role: "agent", name: "Suresh M", agent_id: 3 },
};

export const mockPolicies = [
  { policy_id: 9001, type_name: "motor", status: "active", start_date: "2025-11-12", end_date: "2026-11-11",
    sum_insured: 200000, premium: 9800, total_settled: 42000, remaining_cover: 158000, agent_name: "Suresh M" },
  { policy_id: 9002, type_name: "motor", status: "lapsed", start_date: "2024-06-01", end_date: "2025-05-31",
    sum_insured: 150000, premium: 8200, total_settled: 0, remaining_cover: 150000, agent_name: "Suresh M" },
  { policy_id: 9004, type_name: "health", status: "active", start_date: "2026-01-15", end_date: "2027-01-14",
    sum_insured: 500000, premium: 18500, total_settled: 0, remaining_cover: 500000, agent_name: "Suresh M" },
];

export const mockClaims = [
  { claim_id: 5012, policy_id: 9001, policy_type: "motor", category: "accident", urgency: "high", status: "under_review",
    claimed_amount: 85000, fraud_score: 0.72, filed_date: "2026-10-22", incident_date: "2026-10-21",
    customer_name: "Priya Sharma", city: "Bengaluru", adjuster_name: "Kavitha R", duplicate_of: null },
  { claim_id: 9101, policy_id: 9001, policy_type: "motor", category: "accident", urgency: "medium", status: "settled",
    claimed_amount: 48000, fraud_score: 0.18, filed_date: "2026-09-03", incident_date: "2026-09-01",
    customer_name: "Priya Sharma", city: "Bengaluru", adjuster_name: "Ramesh K", duplicate_of: null },
  { claim_id: 4870, policy_id: 9004, policy_type: "health", category: "hospitalisation", urgency: "critical", status: "approved",
    claimed_amount: 126000, fraud_score: 0.09, filed_date: "2026-08-14", incident_date: "2026-08-10",
    customer_name: "Priya Sharma", city: "Bengaluru", adjuster_name: "Meera N", duplicate_of: null },
];

export const mockClaimResult = {
  claim_id: 5012, status: "under_review",
  nlp: { category: "accident", urgency: "high", confidence: 0.91,
    entities: [{ text: "Silk Board", label: "LOC" }, { text: "85000", label: "MONEY" },
               { text: "KA 01 AB 1234", label: "VEHICLE_NO" }, { text: "21 October", label: "DATE" }] },
  fraud: { score: 0.72, level: "high", reasons: [
    { feature: "policy_age_days", value: 9, impact: 0.46, message: "Claim filed 9 days after the policy started" },
    { feature: "amount_ratio", value: 0.93, impact: 0.33, message: "Claimed amount is 93% of the sum insured" },
    { feature: "max_similarity", value: 0.71, impact: 0.21, message: "Narrative is 71% similar to an earlier claim" } ] },
  duplicate: { is_duplicate: false, similar_claim_id: null, similarity: 0.42 },
  assigned_adjuster: { adjuster_id: 8, name: "Kavitha R" },
};

const timeline = [
  { log_no: 1, old_status: null, new_status: "filed", changed_at: "2026-10-22T10:14:03", changed_by: "priya@demo.in", curr_hash: "3f9a1c0e7b2d" },
  { log_no: 2, old_status: "filed", new_status: "under_review", changed_at: "2026-10-22T10:14:04", changed_by: "system", curr_hash: "a07e55d19c4f" },
];

export const mockClaimDetail = {
  ...mockClaims[0],
  description_summary: "Two-wheeler collision near Silk Board junction",
  nlp_confidence: 0.91,
  policy: mockPolicies[0],
  customer: { name: "Priya Sharma", city: "Bengaluru" },
  narrative: { original_text: "My bike KA 01 AB 1234 was hit by a car near Silk Board junction on 21 October around 8 pm. The front fork and headlight are broken and I hurt my wrist. Garage estimate is Rs 85000.",
    language: "en", nlp: mockClaimResult.nlp },
  documents: [{ doc_type: "bill", filename: "garage_estimate.jpg", ocr_text: "SRI GANESH MOTORS ... TOTAL Rs 85,000" }],
  fraud: mockClaimResult.fraud,
  duplicate: mockClaimResult.duplicate,
  assessments: [], settlement: null, timeline,
};

export const mockQueue = [
  mockClaims[0],
  { claim_id: 5009, policy_id: 8123, policy_type: "motor", category: "theft", urgency: "medium", status: "under_review",
    claimed_amount: 64000, fraud_score: 0.81, filed_date: "2026-10-21", customer_name: "Rahul Verma", city: "Bengaluru", duplicate_of: 4411 },
  { claim_id: 5001, policy_id: 7731, policy_type: "motor", category: "accident", urgency: "low", status: "info_requested",
    claimed_amount: 12500, fraud_score: 0.22, filed_date: "2026-10-19", customer_name: "Anjali Nair", city: "Mysuru", duplicate_of: null },
];

export const mockStats = {
  kpis: { total_claims: 5000, pending: 412, approved_pct: 0.68, avg_settle_days: 11.4, high_risk: 87 },
  claims_by_category: [
    { label: "accident", value: 1620 }, { label: "hospitalisation", value: 1310 }, { label: "theft", value: 640 },
    { label: "flood", value: 420 }, { label: "fire", value: 310 }, { label: "travel_loss", value: 290 },
    { label: "death", value: 160 }, { label: "other", value: 250 } ],
  claims_by_month: ["Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct"]
    .map((m, i) => ({ month: m, count: [310,355,380,362,401,398,420,455,470,438,492,519][i] })),
  fraud_histogram: ["0-0.1","0.1-0.2","0.2-0.3","0.3-0.4","0.4-0.5","0.5-0.6","0.6-0.7","0.7-0.8","0.8-0.9","0.9-1"]
    .map((b, i) => ({ bucket: b, count: [1210,1080,820,610,420,290,190,140,90,40][i] })),
  adjuster_workload: [ { name: "Kavitha R", open: 18 }, { name: "Ramesh K", open: 15 }, { name: "Meera N", open: 12 }, { name: "Vikram S", open: 9 } ],
};

export const mockNlq = {
  sql: "SELECT city, COUNT(*) AS high_fraud_claims FROM v_claim_dashboard WHERE fraud_score >= 0.7 AND YEAR(filed_date) = YEAR(CURDATE()) GROUP BY city ORDER BY high_fraud_claims DESC LIMIT 5",
  columns: ["city", "high_fraud_claims"],
  rows: [["Bengaluru", 41], ["Mysuru", 22], ["Chennai", 17], ["Hyderabad", 13], ["Pune", 9]],
  chart_hint: "bar",
};

export const mockVerifyChain = {
  claim_id: 5012, valid: false, checked: 4, broken_at_log_no: 3,
  rows: [
    { log_no: 1, old_status: null, new_status: "filed", ok: true },
    { log_no: 2, old_status: "filed", new_status: "under_review", ok: true },
    { log_no: 3, old_status: "under_review", new_status: "approved", ok: false, stored_hash: "9f1c2b77e0aa", recomputed_hash: "a07e3d41c95b" },
    { log_no: 4, old_status: "approved", new_status: "settled", ok: true },
  ],
};

export const mockMetrics = {
  category: { model: "tfidf_logreg", precision: 0.91, recall: 0.9, f1: 0.9, baseline_f1: 0.82 },
  urgency: { f1: 0.84, baseline_f1: 0.31, critical_recall: 0.93 },
  fraud: { roc_auc: 0.92, precision_at_high: 0.81, recall_at_high: 0.74 },
  duplicate: { threshold: 0.85, precision: 0.95, recall: 0.88 },
  test_size: 900, trained_at: "2026-10-31T17:20:00",
};

export const mockNotifications = [
  { notif_id: 1, claim_id: 5012, message: "Claim #5012 assigned to Kavitha R for review", is_read: false, created_at: "2026-10-22T10:14:04" },
  { notif_id: 2, claim_id: 9101, message: "Claim #9101 settled: ₹42,000 sent by NEFT", is_read: true, created_at: "2026-09-18T15:02:11" },
];
