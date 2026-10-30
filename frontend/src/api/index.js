// One function per endpoint in the Shared Spec. Pages import from here only.
import { api, mock, USE_MOCKS } from "./client";
import * as M from "./mocks";
import { claimDetail, policyDetail, simulateFileClaim } from "./mockEngine";

const get = (url, fallback, params) => (USE_MOCKS ? mock(fallback) : api.get(url, { params }).then((r) => r.data));
const post = (url, body, fallback, ms) => (USE_MOCKS ? mock(fallback, ms) : api.post(url, body).then((r) => r.data));

export const login = (email, password) => {
  if (USE_MOCKS) {
    const user = M.demoUsers[email];
    if (!user || password !== "Demo@123") return Promise.reject({ code: "BAD_LOGIN", message: "Invalid email or password" });
    return mock({ token: "mock-token", user }, 400);
  }
  return api.post("/auth/login", { email, password }).then((r) => r.data);
};

export const getPolicies = () => get("/policies", M.mockPolicies);
export const getPolicy = (id) => get(`/policies/${id}`, policyDetail(id, M.mockClaims));
export const payPremium = (id, body) => post(`/policies/${id}/payments`, body, { policy_id: +id, payment_no: 3, amount: body.amount, mode: body.mode, pay_date: new Date().toISOString().slice(0, 10), status: "success" }, 900);

export const getClaims = (params) => get("/claims", M.mockClaims, params);
export const getClaim = (id) => get(`/claims/${id}`, claimDetail(id));
export const fileClaim = (body) => (USE_MOCKS ? simulateFileClaim(body) : api.post("/claims", body).then((r) => r.data));
export const uploadDocument = (id, file) => {
  if (USE_MOCKS) return mock({ claim_id: id, filename: file.name, ocr_text: "TOTAL Rs 85,000" }, 800);
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/claims/${id}/documents`, fd).then((r) => r.data);
};
export const getTimeline = (id) => get(`/claims/${id}/timeline`, M.mockClaimDetail.timeline);
export const verifyChain = (id) => get(`/claims/${id}/verify-chain`, { ...M.mockVerifyChain, claim_id: +id });
export const assessClaim = (id, body) => post(`/claims/${id}/assess`, body, { claim_id: id, status: body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "info_requested" });
export const settleClaim = (id, body) => post(`/claims/${id}/settle`, body, { claim_id: id, status: "settled" });

export const getQueue = () => get("/adjusters/queue", M.mockQueue);
export const getStats = () => get("/admin/stats", M.mockStats);
export const askNl = (question) => post("/admin/nl-query", { question }, M.mockNlq, 1100);
export const getMetrics = () => get("/admin/ml-metrics", M.mockMetrics);
export const getNotifications = () => get("/notifications", M.mockNotifications);
