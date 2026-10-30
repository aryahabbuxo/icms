import { Link } from "react-router-dom";
import { getClaims, getPolicies } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { useAuth } from "../../context/AuthContext";
import { date, label, money } from "../../lib/format";
import { StatusBadge } from "../../components/Badges";
import { CardSkeleton, EmptyState, PageHeader, Skeleton, Stat, StatStrip } from "../../components/Ui";
import { PolicyArt } from "../../components/Art";

const OPEN = ["filed", "under_review", "info_requested", "approved"];
const ART_BG = { motor: "bg-sky", health: "bg-blush", property: "bg-[#e4dcc4]", travel: "bg-sky", life: "bg-blush" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function PolicyCard({ p }) {
  const lapsed = p.status !== "active";
  const left = p.sum_insured ? p.remaining_cover / p.sum_insured : 0;
  return (
    <Link to={`/c/policies/${p.policy_id}`}
      className="group block overflow-hidden rounded-[32px] bg-white/60 ring-1 ring-line/70 transition hover:ring-ink dark:bg-night-2 dark:ring-white/10 dark:hover:ring-paper/60">
      <div className={`relative h-44 ${lapsed ? "bg-paper-2 grayscale dark:bg-night" : ART_BG[p.type_name] || "bg-sky"} text-ink`}>
        <PolicyArt type={p.type_name} className={`absolute inset-x-0 bottom-0 mx-auto h-40 ${lapsed ? "opacity-50" : ""}`} />
        <span className="absolute bottom-4 left-4 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper">
          {label(p.type_name)} insurance
        </span>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-ink-soft dark:text-paper/60">Policy {p.policy_id}</span>
          <StatusBadge status={p.status} />
        </div>
        {lapsed ? (
          <p className="mt-4 text-[14px] text-ink-soft dark:text-paper/70">Renew this policy to file new claims on it.</p>
        ) : (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-2 dark:bg-night">
              <div className="h-full rounded-full bg-ink dark:bg-paper" style={{ width: `${Math.max(3, left * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[13px]">
              <span><span className="font-medium">{money(p.remaining_cover)}</span> cover left</span>
              <span className="text-ink-soft dark:text-paper/60">of {money(p.sum_insured)}</span>
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

export default function CustomerHome() {
  const { user } = useAuth();
  const policies = useFetch(getPolicies, []);
  const claims = useFetch(getClaims, []);
  const loading = policies.loading || claims.loading;

  const active = policies.data?.filter((p) => p.status === "active") ?? [];
  const open = claims.data?.filter((c) => OPEN.includes(c.status)) ?? [];
  const settled = policies.data?.reduce((s, p) => s + (p.total_settled || 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}.`}
        subtitle={loading ? "Loading your policies…" : open.length
          ? `You have ${open.length} claim${open.length > 1 ? "s" : ""} in progress. We'll notify you at each step.`
          : "No claims in progress. Your policies are below."}
        actions={<Link to="/c/claims/new" className="btn-primary">File a claim</Link>}
      />

      {loading ? <div className="grid gap-6 sm:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div> : (
        <StatStrip>
          <Stat label="Active policies" value={active.length} hint={`${policies.data.length - active.length} lapsed or expired`} />
          <Stat label="Claims in progress" value={open.length} hint="Filed, in review or approved" />
          <Stat label="Paid out to you" value={money(settled)} hint="Across all your policies" />
        </StatStrip>
      )}

      <section className="mt-14">
        <h2 className="font-serif text-[28px] tracking-tight">Your policies</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[32px]" />)
            : policies.data.map((p) => <PolicyCard key={p.policy_id} p={p} />)}
        </div>
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div>
          <h2 className="font-serif text-[28px] tracking-tight">Recent claims</h2>
          <div className="mt-4">
            {loading ? <CardSkeleton rows={4} /> : claims.data.length === 0 ? (
              <EmptyState title="No claims yet" hint="If something happens, file a claim and follow it here."
                action={<Link to="/c/claims/new" className="btn-primary">File a claim</Link>} />
            ) : (
              <ul className="border-t hairline">
                {claims.data.map((c) => (
                  <li key={c.claim_id} className="border-b hairline">
                    <Link to={`/c/claims/${c.claim_id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 transition hover:bg-paper-2/60 sm:grid-cols-[1fr_auto_auto] sm:px-3 dark:hover:bg-night-2">
                      <div>
                        <div className="font-serif text-[20px]">{label(c.category)} claim</div>
                        <div className="text-[13px] text-ink-soft dark:text-paper/60">#{c.claim_id} on policy {c.policy_id}, filed {date(c.filed_date)}</div>
                      </div>
                      <span className="text-right font-medium tabular-nums sm:text-[16px]">{money(c.claimed_amount)}</span>
                      <span className="col-span-2 sm:col-span-1"><StatusBadge status={c.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex gap-5 self-start rounded-[32px] bg-night p-6 text-paper dark:bg-night-2 dark:ring-1 dark:ring-white/10">
          <div className="hidden w-28 shrink-0 overflow-hidden rounded-full bg-sky text-ink sm:block">
            <PolicyArt type="motor" className="h-full w-full scale-[2.2] object-cover" />
          </div>
          <div className="flex flex-col justify-between py-2">
            <div>
              <h3 className="font-serif text-[24px] leading-tight">Something happened?</h3>
              <p className="mt-3 text-[14px] text-paper/70">Describe it in your own words, in English, Kannada or Hindi. Filing takes about three minutes.</p>
            </div>
            <Link to="/c/claims/new" className="btn-buoy mt-6 self-start">Start a claim</Link>
          </div>
        </aside>
      </section>
    </>
  );
}
