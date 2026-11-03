import { getMetrics } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { dateTime } from "../../lib/format";
import { EmptyState, PageHeader, Skeleton } from "../../components/Ui";

const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const two = (x) => (x == null ? "—" : x.toFixed(2));

function Compare({ name, ours, oursLabel, base, baseLabel, note }) {
  const max = Math.max(ours ?? 0, base ?? 0, 0.01);
  return (
    <section className="rounded-[32px] bg-white/60 p-6 ring-1 ring-line/70 sm:p-7 dark:bg-night-2 dark:ring-white/10">
      <h2 className="font-serif text-[22px]">{name}</h2>
      <div className="mt-4 font-display-tight text-[56px]">{two(ours)}</div>
      <div className="mt-4 space-y-3 text-[13px]">
        {[[oursLabel, ours, "bg-ink dark:bg-paper"], [baseLabel, base, "bg-line dark:bg-white/25"]].map(([l, v, c]) => (
          <div key={l}>
            <div className="flex justify-between gap-3"><span>{l}</span><span className="tabular-nums">{two(v)}</span></div>
            <div className="mt-1 h-2 rounded-full bg-paper-2 dark:bg-night"><div className={`h-full rounded-full ${c}`} style={{ width: `${((v ?? 0) / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      {note && <p className="mt-4 text-[13px] text-ink-soft dark:text-paper/60">{note}</p>}
    </section>
  );
}

function Figure({ src, title, caption }) {
  return (
    <figure className="overflow-hidden rounded-[32px] bg-[#f2eee3] ring-1 ring-line/70 dark:ring-white/10">
      <img src={src} alt={title} className="w-full" loading="lazy" />
      <figcaption className="border-t border-line px-6 py-4 text-[13px] text-[#5d6862]"><span className="font-medium text-[#1d2924]">{title}.</span> {caption}</figcaption>
    </figure>
  );
}

export default function AdminModels() {
  const { data: m, loading, error } = useFetch(getMetrics, []);
  if (loading) return <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-64 rounded-[32px]" /><Skeleton className="h-64 rounded-[32px]" /></div>;
  if (error || !m) return <EmptyState title="Model metrics aren't available" hint="Run the training scripts in the ml folder to create reports/metrics.json." />;
  const { category: c = {}, urgency: u = {}, fraud: f = {}, duplicate: d = {} } = m;

  return (
    <>
      <PageHeader title="How well the models work"
        subtitle={`Scores on held-out test data the models never saw during training.${m.trained_at ? ` Last trained ${dateTime(m.trained_at)}.` : ""}`} />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Compare name="Claim type, F1" ours={c.f1} oursLabel="Our model" base={c.baseline_f1} baseLabel="Naive Bayes"
          note={`${c.test_size ?? "—"} test claims, 8 types. Precision ${pct(c.precision)}, recall ${pct(c.recall)}.`} />
        <Compare name="Priority, F1" ours={u.f1} oursLabel="Our model" base={u.baseline_f1} baseLabel="Always one level"
          note={`Catches ${pct(u.critical_recall)} of critical claims (deaths, ICU, burns).`} />
        <Compare name="Fraud risk, ROC-AUC" ours={f.roc_auc} oursLabel="Explainable model" base={f.baseline_roc_auc} baseLabel="Black-box model"
          note={`We keep the explainable model so every score comes with reasons. At 0.70 it flags ${pct(f.recall_at_high)} of fraud.`} />
        <Compare name="Copied claims, F1" ours={d.f1} oursLabel="F1" base={d.precision} baseLabel="Precision"
          note={`Flags at ${two(d.threshold)} similarity (${two(d.threshold_same_customer)} for the same customer). Recall ${pct(d.recall)}.`} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Figure src="/reports/confusion_matrix_category.png" title="Where claim types get confused" caption="Rows are the true type, columns the prediction. Most errors are between closely related types." />
        <Figure src="/reports/fraud_drivers.png" title="What raises a fraud score" caption="Red factors push towards fraud. These weights are what produce each claim's reasons." />
        <Figure src="/reports/duplicate_similarity.png" title="Copies versus genuine claims" caption="Reworded copies sit far to the right of each claim's closest genuine look-alike." />
        <section className="rounded-[32px] bg-paper-2 p-7 dark:bg-night-2">
          <h2 className="font-serif text-[22px]">About the data</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft dark:text-paper/70">
            Real claim narratives and fraud labels aren't public, so the models are trained on synthetic data built from Indian claim scenarios:
            6,000 narratives in varied tone with typos, and 8,000 claims with fraud patterns we defined. The scores show the method works;
            they are not a measure of real-world fraud detection. Retraining on an insurer's own labelled claims would replace these numbers.
          </p>
        </section>
      </div>
    </>
  );
}
