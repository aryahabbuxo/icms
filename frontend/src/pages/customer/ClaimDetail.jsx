import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { getClaim, uploadDocument } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { date, label, money } from "../../lib/format";
import { StatusBadge } from "../../components/Badges";
import { ClaimTimeline, EntityChips, HighlightedText } from "../../components/Claim";
import { EmptyState, PageHeader, Skeleton } from "../../components/Ui";

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 border-b hairline py-3 last:border-0">
      <dt className="text-ink-soft dark:text-paper/60">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const { data: c, loading, error } = useFetch(() => getClaim(id), [id]);
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="space-y-6"><Skeleton className="h-14 w-2/3" /><Skeleton className="h-72 rounded-[36px]" /></div>;
  if (error || !c) return <EmptyState title="We couldn't find this claim" hint="It may belong to another account, or the link is wrong." action={<Link to="/c" className="btn-primary">Back to overview</Link>} />;

  const documents = docs ?? c.documents ?? [];
  const nlp = c.narrative?.nlp || {};

  const addDoc = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const d = await uploadDocument(c.claim_id, file);
      setDocs([...documents, { doc_type: "other", filename: d.filename || file.name, ocr_text: d.ocr_text }]);
      toast.success(`${file.name} added`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/c" className="mb-6 inline-flex items-center gap-2 text-[14px] text-ink-soft hover:text-ink dark:text-paper/60 dark:hover:text-paper">
        <ArrowLeft size={15} /> Overview
      </Link>
      <PageHeader
        title={`${label(c.category)} claim`}
        subtitle={`#${c.claim_id} on policy ${c.policy_id}, filed ${date(c.filed_date)}`}
        actions={<StatusBadge status={c.status} />}
      />

      {c.status === "info_requested" && (
        <div className="mb-8 rounded-[28px] bg-blush/70 p-5 text-ink">
          <p className="font-medium">Your adjuster needs more information.</p>
          <p className="mt-1 text-[14px] text-ink-soft">Add the requested documents below. The review continues as soon as they arrive.</p>
        </div>
      )}

      {c.settlement && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[32px] bg-night p-7 text-paper dark:bg-night-2">
          <div>
            <div className="text-[14px] text-paper/70">Paid to your bank by {c.settlement.mode} on {date(c.settlement.settle_date)}</div>
            <div className="mt-1 font-display-tight text-[56px]">{money(c.settlement.amount)}</div>
          </div>
          <span className="rounded-full bg-paper px-4 py-2 text-[14px] font-medium text-ink">Claim closed</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-10">
          <section>
            <h2 className="font-serif text-[24px]">What you told us</h2>
            <blockquote className="mt-4 rounded-[28px] bg-white/60 p-6 font-serif text-[19px] leading-[1.7] ring-1 ring-line/70 sm:p-8 dark:bg-night-2 dark:ring-white/10">
              <HighlightedText text={c.narrative?.original_text || c.description_summary || ""} entities={nlp.entities || []} />
            </blockquote>
            <div className="mt-5"><EntityChips entities={nlp.entities || []} /></div>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-[24px]">Documents</h2>
              {!["settled", "rejected"].includes(c.status) && (
                <label className={`btn-ghost cursor-pointer py-2 ${busy ? "pointer-events-none opacity-60" : ""}`}>
                  <Paperclip size={15} /> {busy ? "Uploading…" : "Add a document"}
                  <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => addDoc(e.target.files[0])} />
                </label>
              )}
            </div>
            {documents.length === 0 ? (
              <p className="mt-4 text-ink-soft dark:text-paper/60">No documents yet. Bills, an FIR or photos help the adjuster decide faster.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {documents.map((d, i) => (
                  <li key={i} className="rounded-[24px] p-5 ring-1 ring-line dark:ring-white/15">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-sky text-ink"><FileText size={16} /></span>
                      <div>
                        <div className="font-medium">{d.filename}</div>
                        <div className="text-[13px] text-ink-soft dark:text-paper/60">{label(d.doc_type)}</div>
                      </div>
                    </div>
                    {d.ocr_text && <p className="mt-3 rounded-2xl bg-paper-2 px-4 py-3 text-[13px] text-ink-soft dark:bg-night dark:text-paper/70">Text read from the image: {d.ocr_text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section className="rounded-[28px] bg-paper-2 p-6 dark:bg-night-2">
            <div className="text-[13px] text-ink-soft dark:text-paper/60">Amount claimed</div>
            <div className="font-display-tight text-[48px]">{money(c.claimed_amount)}</div>
            <dl className="mt-4 text-[14px]">
              <Row k="Incident date" v={date(c.incident_date)} />
              <Row k="Policy" v={<Link className="underline decoration-line underline-offset-4" to={`/c/policies/${c.policy_id}`}>{label(c.policy?.type_name || c.policy_type)}, {c.policy_id}</Link>} />
              <Row k="Priority" v={label(c.urgency)} />
              <Row k="Adjuster" v={c.adjuster_name || "Being assigned"} />
            </dl>
          </section>

          <section>
            <h2 className="font-serif text-[24px]">Progress</h2>
            <p className="mt-1 text-[13px] text-ink-soft dark:text-paper/60">Each step is sealed with an audit hash, so this history can't be edited.</p>
            <div className="mt-5"><ClaimTimeline rows={c.timeline || []} /></div>
          </section>
        </div>
      </div>
    </>
  );
}
