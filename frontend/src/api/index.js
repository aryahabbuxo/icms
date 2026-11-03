// One function per endpoint in the Shared Spec. Pages import from here only.
import { api, mock, USE_MOCKS } from "./client";
import * as M from "./mocks";
import { adminClaims, claimDetail, claimsList, policyDetail, queue, simulateAssess, simulateFileClaim, simulateNl, simulateSettle, verifyChainMock } from "./mockEngine";

// `fallback` may be a function so mock data is computed at call time (it changes as you file and assess claims)
const get = (url, fallback, params) => (USE_MOCKS ? mock(typeof fallback === "function" ? fallback() : fallback) : api.get(url, { params }).then((r) => r.data));
const post = (url, body, fallback, ms) => (USE_MOCKS ? mock(fallback, ms) : api.post(url, body).then((r) => r.data));

export const login = (email, password) => {
  if (USE_MOCKS) {
    const user = M.demoUsers[email];
    if (!user || password !== "Demo@123") return Promise.reject({ code: "BAD_LOGIN", message: "Invalid email or password" });
    return mock({ token: "mock-token", user: { ...user, email } }, 400);
  }
  return api.post("/auth/login", { email, password }).then((r) => r.data);
};

export const getPolicies = () => get("/policies", M.mockPolicies);
export const getPolicy = (id) => get(`/policies/${id}`, () => policyDetail(id, claimsList()));
export const payPremium = (id, body) => post(`/policies/${id}/payments`, body, { policy_id: +id, payment_no: 3, amount: body.amount, mode: body.mode, pay_date: new Date().toISOString().slice(0, 10), status: "success" }, 900);

export const getClaims = (params) => get("/claims", claimsList, params);
export const getClaim = (id) => get(`/claims/${id}`, () => claimDetail(id));
export const fileClaim = (body) => (USE_MOCKS ? simulateFileClaim(body) : api.post("/claims", body).then((r) => r.data));
export const uploadDocument = (id, file) => {
  if (USE_MOCKS) return mock({ claim_id: id, filename: file.name, ocr_text: "TOTAL Rs 85,000" }, 800);
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/claims/${id}/documents`, fd).then((r) => r.data);
};
export const getTimeline = (id) => get(`/claims/${id}/timeline`, M.mockClaimDetail.timeline);
export const verifyChain = (id) => get(`/claims/${id}/verify-chain`, () => verifyChainMock(id));
export const assessClaim = (id, body) => (USE_MOCKS ? simulateAssess(id, body) : api.post(`/claims/${id}/assess`, body).then((r) => r.data));
export const settleClaim = (id, body) => (USE_MOCKS ? simulateSettle(id, body) : api.post(`/claims/${id}/settle`, body).then((r) => r.data));
export const getAllClaims = (params) => get("/claims", adminClaims, params);

export const getQueue = () => get("/adjusters/queue", queue);
export const getStats = () => get("/admin/stats", M.mockStats);
export const askNl = (question) => (USE_MOCKS ? simulateNl(question) : api.post("/admin/nl-query", { question }).then((r) => r.data));
// mock mode reads the real metrics.json written by the ML training scripts (copied to public/reports)
export const getMetrics = () => (USE_MOCKS ? fetch("/reports/metrics.json").then((r) => r.json()) : api.get("/admin/ml-metrics").then((r) => r.data));
export const getNotifications = () => get("/notifications", M.mockNotifications);
