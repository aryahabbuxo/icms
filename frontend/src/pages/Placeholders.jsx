// Routes that are wired but whose screens land later in the plan (Person B doc, Step 4).
import { ComingSoon } from "../components/Ui";

export const AdminHome = () => <ComingSoon title="Dashboard" subtitle="Sunday 1:00–6:00"
  items={["5 KPI cards", "Claims by month, by category, fraud histogram, adjuster workload"]} />;
export const AdminClaims = () => <ComingSoon title="All claims" subtitle="Sunday 1:00–6:00" items={["Filters, settle and reassign"]} />;
export const AdminAsk = () => <ComingSoon title="Ask in English" subtitle="Sunday 1:00–6:00" items={["NL → SQL with typewriter SQL and auto chart"]} />;
export const AdminAudit = () => <ComingSoon title="Audit chain" subtitle="Sunday 1:00–6:00" items={["Verify hash chain, highlight the tampered row"]} />;
export const AdminModels = () => <ComingSoon title="Model metrics" subtitle="Sunday 1:00–6:00" items={["F1, ROC-AUC, baseline comparison, confusion matrix"]} />;
export const AgentHome = () => <ComingSoon title="My policies" subtitle="If time allows (first in the cut order)" items={["Policies sold, sell-policy form"]} />;
