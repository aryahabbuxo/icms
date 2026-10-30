import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import toast from "react-hot-toast";
import { getPolicy, payPremium } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { date, label, money } from "../../lib/format";
import { PolicyArt } from "../../components/Art";
import { StatusBadge } from "../../components/Badges";
import { EmptyState, PageHeader, Skeleton, Stat, StatStrip } from "../../components/Ui";

const MODES = [["UPI", "UPI"], ["CARD", "Card"], ["NETBANKING", "Net banking"], ["CASH", "Cash"]];

function PayDialog({ policy, onClose, onPaid }) {
  const [amount, setAmount] = useState(String(policy.premium));
  const [mode, setMode] = useState("UPI");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const pay = async () => {
    setBusy(true);
    try {
      const p = await payPremium(policy.policy_id, { amount: Number(amount), mode });
      toast.success(`Premium of ${money(Number(amount))} paid`);
      onPaid(p);
    } catch { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pay-title" className="w-full max-w-md rounded-[36px] bg-paper p-8 ring-1 ring-line dark:bg-night-2 dark:ring-white/10">
        <div className="flex items-start justify-between">
          <h2 id="pay-title" className="font-serif text-[28px]">Pay premium</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-paper-2 dark:hover:bg-night"><X size={18} /></button>
        </div>
        <p className="mt-1 text-[14px] text-ink-soft dark:text-paper/60">{label(policy.type_name)} insurance, policy {policy.policy_id}</p>
        <label className="label mt-6" htmlFor="pamt">Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span>
          <input id="pamt" inputMode="numeric" className="input pl-9" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="label mt-5">Pay with</div>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`rounded-full px-4 py-2.5 text-[14px] transition ${mode === k ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-[1.5px] ring-ink/70 hover:bg-paper-2 dark:ring-paper/50 dark:hover:bg-night"}`}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn-primary mt-7 w-full py-3" disabled={busy || !Number(amount)} onClick={pay}>
          {busy ? "Recording payment…" : `Pay ${money(Number(amount) || 0)}`}
        </button>
      </div>
    </div>
  );
}

export default function PolicyDetail() {
  const { id } = useParams();
  const { data: p, loading, error } = useFetch(() => getPolicy(id), [id]);
  const [paying, setPaying] = useState(false);
  const [extra, setExtra] = useState([]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-14 w-1/2" /><Skeleton className="h-64 rounded-[36px]" /></div>;
  if (error || !p) return <EmptyState title="We couldn't find this policy" action={<Link to="/c" className="btn-primary">Back to overview</Link>} />;

  const active = p.status === "active";
  const payments = [...extra, ...(p.payments || [])];
  const left = p.sum_insured ? p.remaining_cover / p.sum_insured : 0;

  return (
    <>
      <Link to="/c" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink dark:text-paper/60 dark:hover:text-paper">
        <ArrowLeft size={15} /> Overview
      </Link>
      <PageHeader
        title={`${label(p.type_name)} insurance`}
        subtitle={`Policy ${p.policy_id}, covering ${date(p.start_date)} to ${date(p.end_date)}${p.agent_name ? `, through ${p.agent_name}` : ""}`}
        actions={<>
          {active && <Link to="/c/claims/new" className="btn-ghost">File a claim</Link>}
          <button className="btn-primary" onClick={() => setPaying(true)}>{active ? "Pay premium" : "Pay to renew"}</button>
        </>}
      />

      <section className="grid overflow-hidden rounded-[36px] ring-1 ring-line/70 md:grid-cols-[1fr_1.4fr] dark:ring-white/10">
        <div className={`relative grid min-h-60 place-items-center text-ink ${active ? (p.type_name === "health" ? "bg-blush" : "bg-sky") : "bg-paper-2 grayscale"}`}>
          <PolicyArt type={p.type_name} className="h-44" />
          <span className="absolute bottom-5 left-5"><StatusBadge status={p.status} solid={active} /></span>
        </div>
        <div className="bg-white/60 p-7 sm:p-9 dark:bg-night-2">
          <p className="max-w-lg font-serif text-[19px] leading-relaxed">{p.coverage_desc}</p>
          {active ? (
            <>
              <div className="mt-7 h-3 overflow-hidden rounded-full bg-paper-2 dark:bg-night">
                <div className="h-full rounded-full bg-ink dark:bg-paper" style={{ width: `${Math.max(2, left * 100)}%` }} />
              </div>
              <p className="mt-2 text-[14px]"><span className="font-medium">{money(p.remaining_cover)}</span> of {money(p.sum_insured)} cover left after {money(p.total_settled)} paid out.</p>
            </>
          ) : (
            <p className="mt-6 rounded-2xl bg-blush/70 px-4 py-3 text-[14px] text-ink">This policy has lapsed because a premium was missed. Claims on it will be refused until it's renewed.</p>
          )}
        </div>
      </section>

      <div className="mt-10">
        <StatStrip>
          <Stat label="Sum insured" value={money(p.sum_insured)} />
          <Stat label="Annual premium" value={money(p.premium)} />
          <Stat label="Claims on this policy" value={p.claims?.length ?? 0} />
        </StatStrip>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-serif text-[24px]">Premium payments</h2>
          {payments.length === 0 ? <p className="mt-4 text-ink-soft">No payments recorded yet.</p> : (
            <table className="mt-4 w-full text-left text-[14px]">
              <thead className="text-[13px] text-ink-soft dark:text-paper/60">
                <tr className="border-b hairline"><th className="py-2 font-normal">Date</th><th className="font-normal">Mode</th><th className="text-right font-normal">Amount</th><th className="text-right font-normal">Result</th></tr>
              </thead>
              <tbody>
                {payments.map((x, i) => (
                  <tr key={i} className="border-b hairline">
                    <td className="py-3.5">{date(x.pay_date)}</td>
                    <td>{MODES.find((m) => m[0] === x.mode)?.[1] || x.mode}</td>
                    <td className="text-right tabular-nums">{money(x.amount)}</td>
                    <td className="text-right"><span className={x.status === "success" ? "text-ok" : "text-bad"}>{x.status === "success" ? "Paid" : "Failed"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-serif text-[24px]">Claims on this policy</h2>
          {!p.claims?.length ? <p className="mt-4 text-ink-soft dark:text-paper/60">No claims filed on this policy.</p> : (
            <ul className="mt-4 border-t hairline">
              {p.claims.map((c) => (
                <li key={c.claim_id} className="border-b hairline">
                  <Link to={`/c/claims/${c.claim_id}`} className="flex items-center justify-between gap-4 py-4 hover:bg-paper-2/60 sm:px-2 dark:hover:bg-night-2">
                    <span>
                      <span className="block font-serif text-[18px]">{label(c.category)} claim</span>
                      <span className="text-[13px] text-ink-soft dark:text-paper/60">#{c.claim_id}, {money(c.claimed_amount)}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {paying && <PayDialog policy={p} onClose={() => setPaying(false)} onPaid={(x) => { setExtra((e) => [x, ...e]); setPaying(false); }} />}
    </>
  );
}
