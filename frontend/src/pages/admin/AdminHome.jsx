import { Link } from "react-router-dom";
import { getStats } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { label } from "../../lib/format";
import { BarChart, ChartCard, LineChart } from "../../components/Charts";
import { PageHeader, Skeleton } from "../../components/Ui";

function Kpi({ label: l, value, hint, accent }) {
  return (
    <div className="border-t-[1.5px] border-ink pt-4 dark:border-paper">
      <div className="text-[13px] text-ink-soft dark:text-paper/60">{l}</div>
      <div className={`mt-1 font-display-tight text-[46px] ${accent ? "text-buoy" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-[12.5px] text-ink-soft dark:text-paper/60">{hint}</div>}
    </div>
  );
}

export default function AdminHome() {
  const { data: s, loading } = useFetch(getStats, []);

  if (loading) return <div className="space-y-6"><Skeleton className="h-14 w-1/2" /><Skeleton className="h-28" /><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80 rounded-[32px]" /><Skeleton className="h-80 rounded-[32px]" /></div></div>;

  const k = s.kpis;
  const cats = [...s.claims_by_category].sort((a, b) => b.value - a.value);
  const months = s.claims_by_month;
  const change = months.length > 1 ? Math.round(((months.at(-1).count - months.at(-2).count) / months.at(-2).count) * 100) : 0;
  const hiStart = s.fraud_histogram.findIndex((b) => parseFloat(b.bucket) >= 0.7);

  return (
    <>
      <PageHeader
        title="Claims at a glance"
        subtitle={`${k.pending.toLocaleString("en-IN")} claims are waiting for a decision. ${k.high_risk} of them are high risk.`}
        actions={<>
          <Link to="/admin/ask" className="btn-ghost">Ask a question</Link>
          <Link to="/admin/claims" className="btn-primary">Review claims</Link>
        </>}
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5">
        <Kpi label="Claims filed" value={k.total_claims.toLocaleString("en-IN")} hint="Since launch" />
        <Kpi label="Waiting" value={k.pending.toLocaleString("en-IN")} hint="Filed or in review" />
        <Kpi label="Approved" value={`${Math.round(k.approved_pct * 100)}%`} hint="Of decided claims" />
        <Kpi label="Days to settle" value={k.avg_settle_days} hint="Average, filing to payout" />
        <Kpi label="High risk open" value={k.high_risk} hint="Fraud score 0.70+" accent />
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Claims filed per month"
          note={`${months.at(-1).count} in ${months.at(-1).month}, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on ${months.at(-2).month}.`}>
          <LineChart labels={months.map((m) => m.month)} values={months.map((m) => m.count)} label="Claims filed per month" />
        </ChartCard>

        <ChartCard title="Claims by type" note={`${label(cats[0].label)} claims are the most common.`}>
          <BarChart horizontal labels={cats.map((c) => label(c.label))} values={cats.map((c) => c.value)} label="Claims by type" />
        </ChartCard>

        <ChartCard title="How risky are incoming claims?"
          note={<>Most claims score low. Bars in <span className="font-medium text-buoy">red</span> are high risk (0.70 and above) and go to a senior adjuster.</>}>
          <BarChart labels={s.fraud_histogram.map((b) => b.bucket)} values={s.fraud_histogram.map((b) => b.count)}
            highlight={(i) => hiStart >= 0 && i >= hiStart} label="Number of claims by fraud score" />
        </ChartCard>

        <ChartCard title="Open claims per adjuster" note="New claims go to the least busy specialist in the customer's city.">
          <BarChart horizontal labels={s.adjuster_workload.map((a) => a.name)} values={s.adjuster_workload.map((a) => a.open)} label="Open claims per adjuster" />
        </ChartCard>
      </div>
    </>
  );
}
