import dayjs from "dayjs";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n) => (n == null ? "—" : inr.format(n));
export const date = (d) => (d ? dayjs(d).format("D MMM YYYY") : "—");
export const dateTime = (d) => (d ? dayjs(d).format("D MMM YYYY, h:mm A") : "—");
export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export const label = (s) => (s ? s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
export const riskLevel = (s) => (s == null ? null : s >= 0.7 ? "high" : s >= 0.4 ? "medium" : "low");

export const HOME = { customer: "/c", adjuster: "/adj", admin: "/admin", agent: "/agent" };
