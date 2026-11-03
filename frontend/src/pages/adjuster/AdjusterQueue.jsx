import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getQueue } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { useAuth } from "../../context/AuthContext";
import { date, label, money, riskLevel } from "../../lib/format";
import { RiskBadge, StatusBadge, UrgencyText } from "../../components/Badges";
import { CardSkeleton, EmptyState, PageHeader, Stat, StatStrip } from "../../components/Ui";

const FILTERS = [
  ["all", "All"],
  ["high", "High risk"],
  ["dup", "Possible copies"],
  ["waiting", "Waiting on customer"],
];

export default function AdjusterQueue() {
  const { user } = useAuth();
  const { data, loading } = useFetch(getQueue, []);
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => [...(data || [])].sort((a, b) => (b.fraud_score ?? 0) - (a.fraud_score ?? 0)), [data]);
  const shown = rows.filter((c) => filter === "all"
    || (filter === "high" && riskLevel(c.fraud_score) === "high")
    || (filter === "dup" && c.duplicate_of)
    || (filter === "waiting" && c.status === "info_requested"));
  const high = rows.filter((c) => riskLevel(c.fraud_score) === "high").length;
  const dups = rows.filter((c) => c.duplicate_of).length;

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle={loading ? "Loading claims…" : rows.length
          ? `${rows.length} claims are waiting for you, riskiest first.`
          : "Nothing is waiting for you."}
        actions={user.is_senior
          ? <span className="rounded-full bg-sky px-4 py-2 text-[13px] text-ink">Senior adjuster: you can approve high-risk claims</span>
          : null}
      />

      {!loading && (
        <StatStrip>
          <Stat label="Waiting for review" value={rows.length} hint="Under review or waiting on the customer" />
          <Stat label="High risk" value={high} accent={high > 0} hint="Fraud score of 0.70 or more" />
          <Stat label="Possible copies" value={dups} hint="Wording close to an earlier claim" />
        </StatStrip>
      )}

      <div className="mt-10 flex flex-wrap gap-2" role="radiogroup" aria-label="Filter claims">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-2 text-[14px] transition ${filter === k
              ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-[1.5px] ring-ink/70 hover:bg-paper-2 dark:ring-paper/50 dark:hover:bg-night-2"}`}>
            {l}
          </button>
        ))}
      </div>

      <section className="mt-6">
        {loading ? <CardSkeleton rows={5} /> : shown.length === 0 ? (
          <EmptyState title={filter === "all" ? "Your queue is clear" : "No claims match this filter"}
            hint={filter === "all" ? "New claims assigned to you will appear here." : "Try another filter."} />
        ) : (
          <ul className="border-t hairline">
            {shown.map((c) => (
              <li key={c.claim_id} className="border-b hairline">
                <Link to={`/adj/claims/${c.claim_id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-5 transition hover:bg-paper-2/60 sm:px-3 md:grid-cols-[150px_1fr_110px_120px_24px] dark:hover:bg-night-2">
                  <span className="order-2 md:order-none"><RiskBadge score={c.fraud_score} /></span>
                  <span className="min-w-0">
                    <span className="block font-serif text-[20px] leading-snug">
                      {label(c.category)} claim from {c.customer_name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft dark:text-paper/60">
                      <span>#{c.claim_id}, filed {date(c.filed_date)}{c.city ? `, ${c.city}` : ""}</span>
                      {c.duplicate_of && <span className="rounded-full bg-blush px-2.5 py-0.5 text-[12px] text-ink">Possible copy of #{c.duplicate_of}</span>}
                      {c.status === "info_requested" && <StatusBadge status={c.status} />}
                    </span>
                  </span>
                  <span className="hidden md:block"><UrgencyText urgency={c.urgency} /></span>
                  <span className="hidden text-right font-medium tabular-nums md:block">{money(c.claimed_amount)}</span>
                  <ChevronRight size={18} className="hidden text-ink-soft md:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
