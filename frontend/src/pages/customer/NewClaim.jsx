import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, FileText, Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { fileClaim, getPolicies, uploadDocument } from "../../api";
import { useFetch } from "../../lib/useFetch";
import { label, money } from "../../lib/format";
import { SAMPLES } from "../../lib/samples";
import { Buoy, PolicyArt } from "../../components/Art";
import { ConfidenceMeter, EntityChips } from "../../components/Claim";
import { StatusBadge } from "../../components/Badges";
import { PageHeader, Skeleton } from "../../components/Ui";

const STEPS = ["Policy", "What happened", "Documents"];
const LANGS = [["en", "English"], ["kn", "ಕನ್ನಡ"], ["hi", "हिंदी"]];
const ANALYSIS = [
  "Checking your policy is active and the amount is within cover",
  "Reading your description",
  "Finding places, dates and amounts",
  "Comparing with earlier claims",
  "Choosing the right adjuster",
];
const today = new Date().toISOString().slice(0, 10);

function Stepper({ step }) {
  return (
    <ol className="mb-10 flex flex-wrap gap-2">
      {STEPS.map((s, i) => {
        const n = i + 1, done = n < step, on = n === step;
        return (
          <li key={s} className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-[14px] ${on
            ? "bg-ink text-paper dark:bg-paper dark:text-ink" : done ? "ring-[1.5px] ring-ink dark:ring-paper" : "text-ink-soft ring-1 ring-line dark:text-paper/50 dark:ring-white/15"}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] ${on ? "bg-paper text-ink dark:bg-ink dark:text-paper" : done ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "bg-paper-2 dark:bg-night-2"}`}>
              {done ? <Check size={14} /> : n}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

function Analysing({ done }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShown((s) => Math.min(ANALYSIS.length, s + 1)), 320);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mx-auto max-w-xl py-10 text-center" aria-live="polite">
      <Buoy size={88} spin={!done} className="mx-auto text-ink dark:text-paper" />
      <h2 className="mt-8 font-serif text-[34px] tracking-tight">Reading your claim</h2>
      <ul className="mx-auto mt-8 max-w-md space-y-3 text-left">
        {ANALYSIS.map((a, i) => (
          <li key={a} className={`flex items-center gap-3 transition-opacity ${i < shown ? "opacity-100" : "opacity-30"}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${i < shown ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-1 ring-line"}`}>
              {i < shown && <Check size={13} className="animate-[tick-in_.25s_ease-out]" />}
            </span>
            <span className="text-[15px]">{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Result({ res, form, uploaded }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="rounded-[36px] bg-white/60 p-7 ring-1 ring-line/70 sm:p-10 dark:bg-night-2 dark:ring-white/10">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={res.status} />
          <span className="text-[14px] text-ink-soft dark:text-paper/60">Claim #{res.claim_id}</span>
        </div>
        <h2 className="mt-4 font-serif text-[34px] leading-tight tracking-tight sm:text-[40px]">
          Your claim is with {res.assigned_adjuster?.name || "our claims team"}.
        </h2>
        <p className="mt-3 max-w-lg text-ink-soft dark:text-paper/70">
          We read your description and filed it as below. You'll get an update each time the status changes.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-[13px] text-ink-soft dark:text-paper/60">Type of claim</div>
            <div className="mt-1 font-display-tight text-[40px]">{label(res.nlp.category)}</div>
          </div>
          <div>
            <div className="text-[13px] text-ink-soft dark:text-paper/60">Priority</div>
            <div className={`mt-1 font-display-tight text-[40px] ${["high", "critical"].includes(res.nlp.urgency) ? "text-buoy" : ""}`}>{label(res.nlp.urgency)}</div>
          </div>
        </div>
        <div className="mt-6 max-w-sm"><ConfidenceMeter value={res.nlp.confidence} /></div>

        <h3 className="mt-9 font-serif text-[20px]">What we picked out</h3>
        <div className="mt-3"><EntityChips entities={res.nlp.entities} /></div>
        {form.language !== "en" && (
          <p className="mt-4 text-[13px] text-ink-soft dark:text-paper/60">
            Written in {LANGS.find((l) => l[0] === form.language)[1]}. It was translated to English for reading; your original words are kept on file.
          </p>
        )}
      </section>

      <aside className="flex flex-col gap-5 self-start rounded-[36px] bg-night p-7 text-paper sm:p-8 dark:bg-night-2 dark:ring-1 dark:ring-white/10">
        <h3 className="font-serif text-[24px]">What happens next</h3>
        <ol className="space-y-4 text-[14.5px] text-paper/80">
          <li><span className="font-medium text-paper">Review.</span> {res.assigned_adjuster?.name || "An adjuster"} checks your description{uploaded ? ` and ${uploaded} document${uploaded > 1 ? "s" : ""}` : ""}.</li>
          <li><span className="font-medium text-paper">Decision.</span> You'll hear if it's approved, or if anything else is needed.</li>
          <li><span className="font-medium text-paper">Payment.</span> Approved amounts are paid to your bank, up to {money(form.claimed_amount)}.</li>
        </ol>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link to={`/c/claims/${res.claim_id}`} className="btn-buoy">Track this claim</Link>
          <Link to="/c" className="btn border-[1.5px] border-paper/40 text-paper hover:bg-paper hover:text-ink">Back to overview</Link>
        </div>
      </aside>
    </div>
  );
}

export default function NewClaim() {
  const { data: policies, loading } = useFetch(getPolicies, []);
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState("form"); // form | analysing | done
  const [form, setForm] = useState({ policy_id: null, incident_date: "", claimed_amount: "", language: "en", narrative: "" });
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState(null);
  const sampleIdx = useRef({ en: 0, kn: 0, hi: 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const policy = useMemo(() => policies?.find((p) => p.policy_id === form.policy_id), [policies, form.policy_id]);
  const amount = Number(form.claimed_amount) || 0;
  const step2ok = form.incident_date && amount > 0 && form.narrative.trim().length >= 40;

  const useSample = () => {
    const list = SAMPLES[form.language];
    const s = list[sampleIdx.current[form.language]++ % list.length];
    setForm((f) => ({ ...f, narrative: s.text, claimed_amount: String(s.amount), incident_date: f.incident_date || today }));
  };

  const submit = async () => {
    setError(null);
    setPhase("analysing");
    const minWait = new Promise((r) => setTimeout(r, 1700)); // let the reading steps play out
    try {
      const [res] = await Promise.all([
        fileClaim({ ...form, claimed_amount: amount }),
        minWait,
      ]);
      let n = 0;
      for (const f of files) {
        try { await uploadDocument(res.claim_id, f); n++; } catch { /* error toast already shown */ }
      }
      setUploaded(n);
      setResult(res);
      setPhase("done");
      toast.success(`Claim #${res.claim_id} filed`);
    } catch (e) {
      await minWait;
      setError(e);
      setPhase("form");
      setStep(e?.code === "POLICY_INACTIVE" ? 1 : 2);
    }
  };

  if (phase === "analysing") return <Analysing done={false} />;
  if (phase === "done") return <Result res={result} form={form} uploaded={uploaded} />;

  return (
    <>
      <PageHeader title="File a claim" subtitle="Tell us what happened. It takes about three minutes." />
      <Stepper step={step} />

      {error && (
        <div role="alert" className="mb-8 flex flex-wrap items-start gap-4 rounded-[28px] bg-blush/70 p-5 text-ink ring-1 ring-buoy/40">
          <span className="rounded-full bg-buoy px-3 py-1 text-[12px] font-medium text-white">Not filed</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{error.message}</p>
            <p className="mt-1 text-[13px] text-ink-soft">The database refused this claim ({error.code}). Change the details below and submit again.</p>
          </div>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-white/50"><X size={16} /></button>
        </div>
      )}

      {step === 1 && (
        <section>
          <h2 className="font-serif text-[24px]">Which policy is this claim for?</h2>
          <div className="mt-6 space-y-3">
            {loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[28px]" />) : policies.map((p) => {
              const on = form.policy_id === p.policy_id;
              return (
                <button key={p.policy_id} onClick={() => set("policy_id", p.policy_id)} aria-pressed={on}
                  className={`flex w-full items-center gap-5 overflow-hidden rounded-[28px] p-2 pr-6 text-left transition ${on
                    ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "ring-[1.5px] ring-ink/80 hover:bg-paper-2 dark:ring-paper/60 dark:hover:bg-night-2"}`}>
                  <span className={`grid h-20 w-28 shrink-0 place-items-center rounded-[22px] text-ink ${p.status === "active" ? (p.type_name === "health" ? "bg-blush" : "bg-sky") : "bg-paper-2 opacity-70"}`}>
                    <PolicyArt type={p.type_name} className="h-16" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[20px]">{label(p.type_name)} insurance</span>
                    <span className={`block text-[13px] ${on ? "opacity-75" : "text-ink-soft dark:text-paper/60"}`}>
                      Policy {p.policy_id}{p.status === "active" ? `, ${money(p.remaining_cover)} cover left` : ", renew it before claiming"}
                    </span>
                  </span>
                  <span className={on ? "[&>span]:ring-paper [&>span]:dark:ring-ink" : ""}><StatusBadge status={p.status} /></span>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex justify-end">
            <button className="btn-primary" disabled={!form.policy_id} onClick={() => setStep(2)}>Continue</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="date">When did it happen?</label>
                <input id="date" type="date" max={today} className="input" value={form.incident_date} onChange={(e) => set("incident_date", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="amt">How much are you claiming?</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">₹</span>
                  <input id="amt" inputMode="numeric" className="input pl-9" placeholder="85000" value={form.claimed_amount}
                    onChange={(e) => set("claimed_amount", e.target.value.replace(/\D/g, ""))} />
                </div>
                {amount > 0 && <p className="mt-1.5 text-[13px] text-ink-soft dark:text-paper/60">{money(amount)}{policy ? ` of ${money(policy.sum_insured)} insured` : ""}</p>}
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <label className="label mb-0" htmlFor="story">What happened?</label>
                <div className="flex gap-1 rounded-full bg-paper-2 p-1 dark:bg-night-2" role="radiogroup" aria-label="Language">
                  {LANGS.map(([k, l]) => (
                    <button key={k} role="radio" aria-checked={form.language === k} onClick={() => set("language", k)}
                      className={`rounded-full px-3.5 py-1 text-[13px] transition ${form.language === k ? "bg-ink text-paper dark:bg-paper dark:text-ink" : "text-ink-soft dark:text-paper/70"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <textarea id="story" rows={8} className="input resize-y leading-relaxed" value={form.narrative} onChange={(e) => set("narrative", e.target.value)}
                placeholder="Describe it the way you'd tell a friend: where you were, what happened, what was damaged or lost, and any injuries." />
              <div className="mt-2 flex justify-between text-[13px] text-ink-soft dark:text-paper/60">
                <button type="button" onClick={useSample} className="underline decoration-line underline-offset-4 hover:text-ink dark:hover:text-paper">Use an example</button>
                <span>{form.narrative.trim().length < 40 ? `${40 - form.narrative.trim().length} more characters needed` : `${form.narrative.length} characters`}</span>
              </div>
            </div>
          </div>

          <aside className="self-start rounded-[28px] bg-sky p-6 text-ink">
            <PolicyArt type={policy?.type_name} className="mx-auto h-28" />
            <h3 className="mt-4 font-serif text-[20px]">Tips for a faster decision</h3>
            <ul className="mt-3 space-y-2 text-[14px]">
              <li>Name the place, like a road or area.</li>
              <li>Mention injuries and any hospital you went to.</li>
              <li>Include your vehicle number or FIR number if you have one.</li>
            </ul>
          </aside>

          <div className="flex justify-between lg:col-span-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={!step2ok} onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <label htmlFor="docs"
              className="flex cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-line px-6 py-12 text-center transition hover:border-ink dark:border-white/20 dark:hover:border-paper"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setFiles((f) => [...f, ...e.dataTransfer.files].slice(0, 6)); }}>
              <Paperclip size={22} />
              <span className="mt-3 font-serif text-[20px]">Add bills, an FIR or photos</span>
              <span className="mt-1 text-[14px] text-ink-soft dark:text-paper/60">Drop files here or click to choose. JPG, PNG or PDF, up to 5 MB each.</span>
              <input id="docs" type="file" multiple accept="image/*,.pdf" className="sr-only"
                onChange={(e) => setFiles((f) => [...f, ...e.target.files].slice(0, 6))} />
            </label>
            {files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-full py-2 pl-4 pr-2 ring-1 ring-line dark:ring-white/15">
                    <FileText size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{f.name}</span>
                    <span className="text-[12px] text-ink-soft">{Math.ceil(f.size / 1024)} KB</span>
                    <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="rounded-full p-1.5 hover:bg-paper-2 dark:hover:bg-night-2"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] text-ink-soft dark:text-paper/60">Documents are optional now. You can add them later from the claim page.</p>
          </div>

          <aside className="self-start rounded-[28px] bg-paper-2 p-6 dark:bg-night-2">
            <h3 className="font-serif text-[20px]">Your claim</h3>
            <dl className="mt-4 space-y-3 text-[14px]">
              <div className="flex justify-between gap-4"><dt className="text-ink-soft dark:text-paper/60">Policy</dt><dd className="text-right">{label(policy?.type_name)}, {form.policy_id}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft dark:text-paper/60">Date</dt><dd>{form.incident_date}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft dark:text-paper/60">Amount</dt><dd className="font-medium">{money(amount)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft dark:text-paper/60">Documents</dt><dd>{files.length || "None yet"}</dd></div>
            </dl>
            <p className="mt-4 line-clamp-4 border-t hairline pt-4 font-serif text-[15px] italic leading-relaxed">“{form.narrative}”</p>
          </aside>

          <div className="flex justify-between lg:col-span-2">
            <button className="btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn-buoy px-7" onClick={submit}>Submit claim</button>
          </div>
        </section>
      )}
    </>
  );
}
