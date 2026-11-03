import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, X } from "lucide-react";
import toast from "react-hot-toast";
import { assessClaim, getClaim } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { useAuth } from "../../context/AuthContext";
import { date, dateTime, label, money } from "../../lib/format";
import { StatusBadge } from "../../components/Badges";
import { ClaimTimeline, EntityChips, FraudGauge, HighlightedText, ReasonBars } from "../../components/Claim";
import { EmptyState, PageHeader, Skeleton } from "../../components/Ui";

const DECISIONS = [["approve", "Approve"], ["request_info", "Ask for more"], ["reject", "Reject"]];
const DONE = { approved: "Approved", rejected: "Rejected", info_requested: "More information requested", settled: "Settled" };

function AssessForm({ claim, user, onDone }) {
  const [decision, setDecision] = useState("approve");
  const [amount, setAmount] = useState(String(Math.round(claim.claimed_amount)));
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const high = (claim.fraud_score ?? 0) >= 0.7;
  const needsRemarks = decision !== "approve";
  const ok = decision === "approve" ? Number(amount) > 0 : remarks.trim().length >= 5;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await assessClaim(claim.claim_id, { decision, approved_amount: decision === "approve" ? Number(amount) : 0, remarks });
      toast.success(decision === "approve" ? `Approved ${money(Number(amount))}` : decision === "reject" ? "Claim rejected" : "Request sent to the customer");
      onDone(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[32px] bg-paper-2 p-6 sm:p-7 dark:bg-night-2">
      <h2 className="font-serif text-[24px]">Your decision</h2>
      <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Decision">
        {DECISIONS.map(([k, l]) => (
          <button type="button" key={k} role="radio" aria-checked={decision === k} onClick={() => setDecision(k)}
            className={`rounded-full px-3 py-2.5 text-[14px] transition ${decision === k
              ? (k === "reject" ? "bg-buoy text-white" : "bg-ink text-paper dark:bg-paper dark:text-ink")
              : "ring-[1.5px] ring-ink/70 hover:bg-paper dark:ring-paper/50 dark:hover:bg-night"}`}>
            {l}
          </button>
        ))}
      </div>

      {decision === "approve" && (
        <div className="mt-5">
          <label className="label" htmlFor="appr">Amount to approve</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span>
            <input id="appr" inputMode="numeric" className="input pl-9" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-soft dark:text-paper/60">Claimed {money(claim.claimed_amount)}. Approve less for depreciation or excess.</p>
          {high && !user.is_senior && (
            <p className="mt-3 rounded-2xl bg-blush/70 px-4 py-3 text-[13px] text-ink">
              This claim is high risk, so the database only accepts an approval from a senior adjuster.
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        <label className="label" htmlFor="rem">{needsRemarks ? (decision === "reject" ? "Reason for rejecting (the customer sees this)" : "What do you need from the customer?") : "Notes (optional)"}</label>
        <textarea id="rem" rows={3} className="input resize-y" value={remarks} onChange={(e) => setRemarks(e.target.value)}
          placeholder={decision === "request_info" ? "For example: a copy of the FIR and photos of the damage." : decision === "reject" ? "For example: the incident happened before the policy started." : "For example: bill verified, 10% depreciation applied."} />
      </div>

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl bg-blush/70 p-4 text-ink ring-1 ring-buoy/40">
          <div className="flex-1">
            <p className="font-medium">{error.message}</p>
            <p className="mt-1 text-[12.5px] text-ink-soft">Refused by the database ({error.code}). Nothing was saved.</p>
          </div>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-white/50"><X size={15} /></button>
        </div>
      )}

      <button className={`${decision === "reject" ? "btn-buoy" : "btn-primary"} mt-6 w-full py-3`} disabled={busy || !ok}>
        {busy ? "Saving…" : decision === "approve" ? `Approve ${money(Number(amount) || 0)}` : decision === "reject" ? "Reject claim" : "Send request"}
      </button>
    </form>
  );
}

export default function AdjusterClaim() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: c, loading, error, reload } = useFetch(() => getClaim(id), [id]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-14 w-2/3" /><Skeleton className="h-96 rounded-[36px]" /></div>;
  if (error || !c) return <EmptyState title="We couldn't open this claim" action={<Link to="/adj" className="btn-primary">Back to queue</Link>} />;

  const nlp = c.narrative?.nlp || {};
  const fraud = c.fraud || { score: c.fraud_score ?? 0, level: "low", reasons: [] };
  const open = ["under_review", "info_requested"].includes(c.status);
  const last = c.assessments?.at(-1);

  return (
    <>
      <Link to="/adj" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink dark:text-paper/60 dark:hover:text-paper">
        <ArrowLeft size={15} /> Review queue
      </Link>
      <PageHeader
        title={`${label(c.category)} claim from ${c.customer?.name || c.customer_name}`}
        subtitle={`#${c.claim_id} on ${label(c.policy?.type_name || c.policy_type)} policy ${c.policy_id}, filed ${date(c.filed_date)}${c.customer?.city ? `, ${c.customer.city}` : ""}`}
        actions={<StatusBadge status={c.status} />}
      />

      <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-10">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-[24px]">What the customer wrote</h2>
              <span className="text-[13px] text-ink-soft dark:text-paper/60">
                Read as {label(nlp.category || c.category)}, {label(nlp.urgency || c.urgency).toLowerCase()} priority
                {nlp.confidence ? `, ${Math.round(nlp.confidence * 100)}% confident` : ""}
              </span>
            </div>
            <blockquote className="mt-4 rounded-[28px] bg-white/60 p-6 font-serif text-[19px] leading-[1.7] ring-1 ring-line/70 sm:p-8 dark:bg-night-2 dark:ring-white/10">
              <HighlightedText text={c.narrative?.original_text || ""} entities={nlp.entities || []} />
            </blockquote>
            <div className="mt-5"><EntityChips entities={nlp.entities || []} /></div>
          </section>

          <section className="grid gap-6 sm:grid-cols-3">
            {[["Claimed", money(c.claimed_amount)], ["Sum insured", money(c.policy?.sum_insured)], ["Incident", date(c.incident_date)]].map(([k, v]) => (
              <div key={k} className="border-t hairline pt-3">
                <div className="text-[13px] text-ink-soft dark:text-paper/60">{k}</div>
                <div className="mt-1 font-display-tight text-[34px]">{v}</div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="font-serif text-[24px]">Documents</h2>
            {!c.documents?.length ? <p className="mt-3 text-ink-soft dark:text-paper/60">The customer hasn't uploaded any documents.</p> : (
              <ul className="mt-4 space-y-3">
                {c.documents.map((d, i) => (
                  <li key={i} className="rounded-[24px] p-5 ring-1 ring-line dark:ring-white/15">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-sky text-ink"><FileText size={16} /></span>
                      <div><div className="font-medium">{d.filename}</div><div className="text-[13px] text-ink-soft dark:text-paper/60">{label(d.doc_type)}</div></div>
                    </div>
                    {d.ocr_text && <p className="mt-3 rounded-2xl bg-paper-2 px-4 py-3 font-mono text-[12.5px] text-ink-soft dark:bg-night dark:text-paper/70">{d.ocr_text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-serif text-[24px]">History</h2>
            <div className="mt-5"><ClaimTimeline rows={c.timeline || []} /></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[32px] bg-white/60 p-6 ring-1 ring-line/70 sm:p-7 dark:bg-night-2 dark:ring-white/10">
            <h2 className="font-serif text-[24px]">Fraud risk</h2>
            <div className="mt-4 flex justify-center"><FraudGauge score={fraud.score ?? 0} level={fraud.level} /></div>
            <h3 className="mt-7 text-[14px] font-medium">Why it scored this way</h3>
            <div className="mt-3"><ReasonBars reasons={fraud.reasons} /></div>
            <p className="mt-5 text-[12.5px] text-ink-soft dark:text-paper/60">Each bar is that factor's share of the push towards fraud, from an explainable model. It supports your judgement; it doesn't replace it.</p>
          </section>

          {c.duplicate?.is_duplicate && (
            <section className="rounded-[32px] bg-blush p-6 text-ink">
              <h2 className="font-serif text-[22px]">Possible copy of an earlier claim</h2>
              <p className="mt-2 text-[14px]">The wording is {Math.round(c.duplicate.similarity * 100)}% similar to claim #{c.duplicate.similar_claim_id}. Compare the two before deciding.</p>
              <Link to={`/adj/claims/${c.duplicate.similar_claim_id}`} className="btn-primary mt-4 py-2">Open claim #{c.duplicate.similar_claim_id}</Link>
            </section>
          )}

          {open ? (
            <AssessForm claim={c} user={user} onDone={reload} />
          ) : (
            <section className="rounded-[32px] bg-night p-6 text-paper sm:p-7 dark:bg-night-2 dark:ring-1 dark:ring-white/10">
              <div className="text-[14px] text-paper/70">Decision</div>
              <div className="mt-1 font-serif text-[28px]">{DONE[c.status] || label(c.status)}</div>
              {last && (
                <>
                  {last.decision === "approve" && <div className="mt-2 font-display-tight text-[44px]">{money(last.approved_amount)}</div>}
                  <p className="mt-3 text-[14px] text-paper/75">By {last.adjuster_name}, {dateTime(last.review_date)}{last.remarks ? `: “${last.remarks}”` : ""}</p>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
