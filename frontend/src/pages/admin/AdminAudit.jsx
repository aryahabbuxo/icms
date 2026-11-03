import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { verifyChain } from "../../api";
import { dateTime, label } from "../../lib/format";
import { Buoy } from "../../components/Art";
import { PageHeader } from "../../components/Ui";

export default function AdminAudit() {
  const [id, setId] = useState("5012");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!res) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(res.rows.length); return; }
    setShown(0);
    const t = setInterval(() => setShown((n) => { if (n + 1 >= res.rows.length) clearInterval(t); return n + 1; }), 260);
    return () => clearInterval(t);
  }, [res]);

  const verify = async (e) => {
    e?.preventDefault();
    if (!id) return;
    setBusy(true); setRes(null);
    try { setRes(await verifyChain(id)); } finally { setBusy(false); }
  };

  const done = res && shown >= res.rows.length;

  return (
    <>
      <PageHeader title="Audit trail check"
        subtitle="Every status change is sealed with a SHA-256 hash of the change and the previous hash. Editing any row breaks every link after it." />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <aside className="self-start rounded-[32px] bg-paper-2 p-6 sm:p-7 dark:bg-night-2">
          <form onSubmit={verify}>
            <label className="label" htmlFor="cid">Claim number</label>
            <div className="flex gap-2">
              <input id="cid" inputMode="numeric" className="input" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} />
              <button className="btn-primary shrink-0" disabled={busy || !id}>{busy ? <Buoy size={18} spin /> : "Check"}</button>
            </div>
          </form>
          <h2 className="mt-8 font-serif text-[20px]">How each row is sealed</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-night p-4 font-mono text-[12px] leading-relaxed text-[#cfe8e3]">{`curr_hash = SHA2(CONCAT_WS('|',
  prev_hash, claim_id, log_no,
  old_status, new_status,
  changed_at), 256)`}</pre>
          <p className="mt-3 text-[13px] text-ink-soft dark:text-paper/60">The check recomputes every hash inside MySQL and compares it with the stored one.</p>
        </aside>

        <section>
          {!res && !busy && <p className="pt-2 text-ink-soft dark:text-paper/60">Enter a claim number and press Check.</p>}
          {res && (
            <>
              <div className={`mb-6 rounded-[28px] p-6 transition-opacity ${done ? "opacity-100" : "opacity-0"} ${res.valid ? "bg-sky text-ink" : "bg-buoy text-white"}`} aria-live="polite">
                <p className="font-serif text-[26px] leading-tight">
                  {res.valid ? `History intact: all ${res.checked} entries check out.` : `Tampering detected at entry ${res.broken_at_log_no}.`}
                </p>
                <p className="mt-1 text-[14px] opacity-85">
                  {res.valid ? "Nobody has edited this claim's history since it was written." : "This row was changed after it was sealed. Its stored hash no longer matches its contents."}
                </p>
              </div>
              <ol className="space-y-3">
                {res.rows.slice(0, shown).map((r) => (
                  <li key={r.log_no} className={`animate-[reason-in_.3s_ease-out_both] rounded-[24px] p-5 ${r.ok ? "ring-1 ring-line dark:ring-white/15" : "bg-blush text-ink ring-2 ring-buoy"}`}>
                    <div className="flex items-center gap-4">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${r.ok ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "bg-buoy text-white"}`}>
                        {r.ok ? <Check size={16} /> : <X size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-serif text-[18px]">Entry {r.log_no}: {r.old_status ? `${label(r.old_status)} → ` : ""}{label(r.new_status)}</div>
                        <div className="text-[12.5px] opacity-70">{r.changed_at ? dateTime(r.changed_at) : ""}{r.changed_by ? `, by ${r.changed_by}` : ""}</div>
                      </div>
                    </div>
                    {!r.ok && (
                      <dl className="mt-4 grid gap-2 font-mono text-[12.5px] sm:grid-cols-2">
                        <div className="rounded-xl bg-white/70 px-3 py-2"><dt className="font-sans text-[11.5px] text-ink-soft">Stored hash</dt><dd>{r.stored_hash}…</dd></div>
                        <div className="rounded-xl bg-white/70 px-3 py-2"><dt className="font-sans text-[11.5px] text-ink-soft">Recomputed now</dt><dd className="text-bad">{r.recomputed_hash}…</dd></div>
                      </dl>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </>
  );
}
