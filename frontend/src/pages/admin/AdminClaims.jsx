import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { getAllClaims, settleClaim } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { date, label, money } from "../../lib/format";
import { RiskBadge, StatusBadge } from "../../components/Badges";
import { CardSkeleton, EmptyState, PageHeader } from "../../components/Ui";

const TABS = [["all", "All"], ["approved", "Ready to pay"], ["under_review", "In review"], ["settled", "Settled"], ["rejected", "Rejected"]];
const MODES = [["NEFT", "NEFT"], ["UPI", "UPI"], ["CHEQUE", "Cheque"]];

function SettleDialog({ claim, onClose, onDone }) {
  const [amount, setAmount] = useState(String(Math.round(claim.approved_amount ?? claim.claimed_amount)));
  const [mode, setMode] = useState("NEFT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const pay = async () => {
    setBusy(true); setError(null);
    try {
      await settleClaim(claim.claim_id, { amount: Number(amount), mode });
      toast.success(`Paid ${money(Number(amount))} to ${claim.customer_name}`);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="settle-title" className="w-full max-w-md rounded-[36px] bg-paper p-8 ring-1 ring-line dark:bg-night-2 dark:ring-white/10">
        <div className="flex items-start justify-between">
          <h2 id="settle-title" className="font-serif text-[28px]">Pay this claim</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-paper-2 dark:hover:bg-night"><X size={18} /></button>
        </div>
        <p className="mt-1 text-[14px] text-ink-soft dark:text-paper/60">
          #{claim.claim_id}, {label(claim.category)} claim from {claim.customer_name}. Approved {money(claim.approved_amount)}.
        </p>
        <label className="label mt-6" htmlFor="samt">Amount to pay</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span>
          <input id="samt" inputMode="numeric" className="input pl-9" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="label mt-5">Pay by</div>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`rounded-full px-4 py-2.5 text-[14px] transition ${mode === k ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-[1.5px] ring-ink/70 hover:bg-paper-2 dark:ring-paper/50 dark:hover:bg-night"}`}>
              {l}
            </button>
          ))}
        </div>
        {error && (
          <div role="alert" className="mt-5 rounded-2xl bg-blush/70 p-4 text-ink ring-1 ring-buoy/40">
            <p className="font-medium">{error.message}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">Refused by the database ({error.code}). The payment was rolled back; nothing was saved.</p>
          </div>
        )}
        <button className="btn-primary mt-7 w-full py-3" disabled={busy || !Number(amount)} onClick={pay}>
          {busy ? "Paying…" : `Pay ${money(Number(amount) || 0)}`}
        </button>
      </div>
    </div>
  );
}

export default function AdminClaims() {
  const { data, loading, reload } = useFetch(getAllClaims, []);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [settling, setSettling] = useState(null);

  const rows = useMemo(() => (data || []).filter((c) =>
    (tab === "all" || c.status === tab || (tab === "under_review" && c.status === "info_requested"))
    && (!q || `${c.claim_id} ${c.customer_name} ${c.category} ${c.city}`.toLowerCase().includes(q.toLowerCase()))), [data, tab, q]);
  const ready = (data || []).filter((c) => c.status === "approved").length;

  return (
    <>
      <PageHeader title="All claims"
        subtitle={loading ? "Loading claims…" : ready ? `${ready} approved claim${ready > 1 ? "s are" : " is"} ready to pay.` : "No approved claims are waiting for payment."} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filter by status">
          {TABS.map(([k, l]) => (
            <button key={k} role="radio" aria-checked={tab === k} onClick={() => setTab(k)}
              className={`rounded-full px-4 py-2 text-[14px] transition ${tab === k ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-[1.5px] ring-ink/70 hover:bg-paper-2 dark:ring-paper/50 dark:hover:bg-night-2"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search claims</span>
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input className="input rounded-full py-2.5 pl-10" placeholder="Search name, city or claim number" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="mt-6 overflow-x-auto">
        {loading ? <CardSkeleton rows={6} /> : rows.length === 0 ? <EmptyState title="No claims match" hint="Try another filter or search." /> : (
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="text-[13px] text-ink-soft dark:text-paper/60">
              <tr className="border-b hairline">
                <th className="py-3 font-normal">Claim</th><th className="font-normal">Customer</th><th className="font-normal">Risk</th>
                <th className="text-right font-normal">Amount</th><th className="pl-6 font-normal">Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.claim_id} className="border-b hairline">
                  <td className="py-4">
                    <div className="font-serif text-[17px]">{label(c.category)}</div>
                    <div className="text-[12.5px] text-ink-soft dark:text-paper/60">#{c.claim_id}, {date(c.filed_date)}</div>
                  </td>
                  <td><div>{c.customer_name}</div><div className="text-[12.5px] text-ink-soft dark:text-paper/60">{c.city}</div></td>
                  <td><RiskBadge score={c.fraud_score} /></td>
                  <td className="text-right tabular-nums">
                    {money(c.claimed_amount)}
                    {c.status === "approved" && c.approved_amount !== c.claimed_amount && <div className="text-[12.5px] text-ok">{money(c.approved_amount)} approved</div>}
                  </td>
                  <td className="pl-6"><StatusBadge status={c.status} /></td>
                  <td className="text-right">
                    {c.status === "approved" && <button className="btn-primary py-2" onClick={() => setSettling(c)}>Pay</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {settling && <SettleDialog claim={settling} onClose={() => setSettling(null)} onDone={() => { setSettling(null); reload(); }} />}
    </>
  );
}
