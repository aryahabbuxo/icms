import { label, riskLevel } from "../lib/format";

// Status pills: outlined, with a coloured dot carrying the meaning (never colour alone: the word is always shown).
const DOT = {
  filed: "bg-ink-soft", under_review: "bg-warn", info_requested: "bg-warn", approved: "bg-ok",
  settled: "bg-ok", rejected: "bg-bad", active: "bg-ok", lapsed: "bg-bad", expired: "bg-ink-soft", cancelled: "bg-ink-soft",
};

export function StatusBadge({ status, solid = false }) {
  const settled = status === "settled" || solid;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium ${settled
      ? "bg-ink text-paper dark:bg-paper dark:text-ink"
      : "ring-[1.5px] ring-ink/70 dark:ring-paper/60"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${settled ? "bg-paper dark:bg-ink" : DOT[status] || "bg-ink-soft"}`} />
      {label(status)}
    </span>
  );
}

const RISK = { low: "bg-ok", medium: "bg-warn", high: "bg-buoy" };

export function RiskBadge({ score }) {
  const lvl = riskLevel(score);
  if (!lvl) return <span className="text-ink-soft">—</span>;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-medium ${lvl === "high" ? "bg-buoy text-white" : "bg-paper-2 dark:bg-night"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${lvl === "high" ? "bg-white" : RISK[lvl]}`} />
      {score.toFixed(2)} {lvl} risk
    </span>
  );
}

const URGENCY = { low: "", medium: "", high: "text-warn font-medium", critical: "text-buoy font-semibold" };
export const UrgencyText = ({ urgency }) => <span className={`text-[13px] ${URGENCY[urgency] || ""}`}>{label(urgency)}</span>;
