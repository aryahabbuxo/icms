import { useEffect, useRef, useState } from "react";
import { ArrowUp, ShieldCheck } from "lucide-react";
import { askNl } from "../../api";
import { label } from "../../lib/format";
import { Buoy } from "../../components/Art";
import { BarChart, LineChart } from "../../components/Charts";
import { PageHeader } from "../../components/Ui";

const SUGGESTIONS = [
  "Top 5 cities by high-risk claims this year",
  "How many claims are pending in Bengaluru?",
  "Claims filed per month over the last 6 months",
  "Average days to settle by policy type",
  "Total amount settled for each claim category",
];

function useTypewriter(text, speed = 10) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!text) { setOut(""); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOut(text); return; }
    let i = 0;
    setOut("");
    const t = setInterval(() => { i += 2; setOut(text.slice(0, i)); if (i >= text.length) clearInterval(t); }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return out;
}

const fmtCell = (v, col) => typeof v === "number"
  ? (/amount|settled|paid/i.test(col) ? `₹${Math.round(v).toLocaleString("en-IN")}` : v.toLocaleString("en-IN"))
  : label(String(v));

export default function AdminAsk() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const sql = useTypewriter(res?.sql);
  const typed = res && sql.length >= res.sql.length;
  const inputRef = useRef(null);

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text); setAsked(text); setBusy(true); setRes(null); setError(null);
    try { setRes(await askNl(text)); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const cols = res?.columns || [];
  const numeric = res && cols.length === 2 && res.rows.every((r) => typeof r[1] === "number");

  return (
    <>
      <PageHeader title="Ask in plain English" subtitle="Type a question about claims. ICMS writes the SQL, runs it read-only, and charts the answer." />

      <form onSubmit={(e) => { e.preventDefault(); ask(); }}
        className="flex items-center gap-2 rounded-full bg-white/70 p-2 pl-6 ring-[1.5px] ring-ink focus-within:ring-2 dark:bg-night-2 dark:ring-paper/60">
        <label htmlFor="q" className="sr-only">Your question</label>
        <input id="q" ref={inputRef} className="min-w-0 flex-1 bg-transparent py-2 text-[17px] outline-none placeholder:text-ink-soft/60"
          placeholder="Which city had the most high-risk claims this year?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-paper disabled:opacity-50 dark:bg-paper dark:text-ink"
          disabled={busy || !question.trim()} aria-label="Ask">
          {busy ? <Buoy size={20} spin /> : <ArrowUp size={18} />}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={busy}
            className="rounded-full px-4 py-2 text-[13.5px] ring-1 ring-line transition hover:bg-paper-2 hover:ring-ink disabled:opacity-60 dark:ring-white/15 dark:hover:bg-night-2">
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-8 rounded-[28px] bg-blush/70 p-6 text-ink">
          <p className="font-serif text-[20px]">{error.code === "UNSAFE_QUERY" ? "That question was refused" : "No answer for that one"}</p>
          <p className="mt-1 text-[14px]">{error.message}</p>
          {error.code === "UNSAFE_QUERY" && <p className="mt-2 text-[13px] text-ink-soft">Questions run as a database user that can only read, and never sees passwords.</p>}
        </div>
      )}

      {busy && <p className="mt-10 text-center text-ink-soft dark:text-paper/60">Writing a query for “{asked}”…</p>}

      {res && (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section className="self-start rounded-[32px] bg-night p-6 text-paper sm:p-7 dark:ring-1 dark:ring-white/10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-[20px]">The SQL it wrote</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] text-paper/80"><ShieldCheck size={13} /> Read-only</span>
            </div>
            <pre className="mt-4 min-h-40 overflow-x-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-[#cfe8e3]">{sql}{!typed && <span className="animate-pulse">▍</span>}</pre>
          </section>

          <section className={`rounded-[32px] bg-white/60 p-6 ring-1 ring-line/70 transition-opacity duration-500 sm:p-7 dark:bg-night-2 dark:ring-white/10 ${typed ? "opacity-100" : "opacity-0"}`}>
            <h2 className="font-serif text-[22px] leading-snug">{asked}</h2>
            <p className="mt-1 text-[13px] text-ink-soft dark:text-paper/60">{res.rows.length} row{res.rows.length === 1 ? "" : "s"}</p>
            <div className="mt-5">
              {res.rows.length === 1 && cols.length === 1 ? (
                <div className="font-display-tight text-[88px]">{fmtCell(res.rows[0][0], cols[0])}</div>
              ) : numeric && res.chart_hint === "line" ? (
                <LineChart labels={res.rows.map((r) => String(r[0]))} values={res.rows.map((r) => r[1])} label={asked} />
              ) : numeric && res.chart_hint === "bar" ? (
                <BarChart horizontal labels={res.rows.map((r) => label(String(r[0])))} values={res.rows.map((r) => r[1])} label={asked}
                  format={(v) => fmtCell(v, cols[1])} height={Math.max(180, res.rows.length * 44)} />
              ) : (
                <table className="w-full text-[14px]">
                  <thead><tr className="border-b hairline text-[13px] text-ink-soft">{cols.map((c) => <th key={c} className="py-2 text-left font-normal">{label(c)}</th>)}</tr></thead>
                  <tbody>{res.rows.map((r, i) => <tr key={i} className="border-b hairline">{r.map((v, j) => <td key={j} className="py-2">{fmtCell(v, cols[j])}</td>)}</tr>)}</tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
