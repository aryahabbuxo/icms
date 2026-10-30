import { useEffect, useState } from "react";
import { dateTime, label } from "../lib/format";

/* ---------------------------------------------------------------- entities */
const ENT = {
  LOC: ["bg-sky", "Place"], MONEY: ["bg-blush", "Amount"], DATE: ["bg-paper-2 ring-1 ring-line", "Date"],
  VEHICLE_NO: ["bg-[#e4dcc4]", "Vehicle"], HOSPITAL: ["bg-blush", "Hospital"], PERSON: ["bg-sky", "Person"],
  ORG: ["bg-paper-2 ring-1 ring-line", "Organisation"],
};

export function EntityChips({ entities = [] }) {
  if (!entities.length) return <p className="text-[14px] text-ink-soft dark:text-paper/60">No places, dates or amounts were found in the description.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {entities.map((e, i) => {
        const [bg, name] = ENT[e.label] || ENT.ORG;
        return (
          <span key={i} className={`inline-flex items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5 text-[13.5px] text-ink ${bg}`}>
            {e.text}
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-ink-soft">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Narrative text with detected entities underlined in their chip colour. */
export function HighlightedText({ text = "", entities = [] }) {
  if (!entities.length) return <>{text}</>;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${entities.map((e) => esc(e.text)).join("|")})`, "g");
  const map = Object.fromEntries(entities.map((e) => [e.text, e.label]));
  return text.split(re).map((part, i) =>
    map[part] ? <mark key={i} className={`rounded px-0.5 text-ink ${(ENT[map[part]] || ENT.ORG)[0]}`}>{part}</mark> : <span key={i}>{part}</span>
  );
}

/* ---------------------------------------------------------------- confidence */
export function ConfidenceMeter({ value = 0 }) {
  const low = value < 0.5;
  return (
    <div>
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-soft dark:text-paper/60">Model confidence</span>
        <span className="font-medium">{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2 dark:bg-night">
        <div className={`h-full rounded-full ${low ? "bg-warn" : "bg-ink dark:bg-paper"}`} style={{ width: `${value * 100}%` }} />
      </div>
      {low && <p className="mt-2 text-[13px] text-warn">Low confidence. The adjuster will confirm the category.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */
export function ClaimTimeline({ rows = [] }) {
  return (
    <ol className="relative ml-2 border-l-[1.5px] border-ink/25 dark:border-paper/25">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <li key={r.log_no} className="relative pb-7 pl-7 last:pb-0">
            <span className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full ring-4 ring-paper dark:ring-night ${last ? "bg-buoy" : "bg-ink dark:bg-paper"}`} />
            <div className="font-serif text-[19px] leading-tight">{label(r.new_status)}</div>
            <div className="mt-1 text-[13px] text-ink-soft dark:text-paper/60">
              {dateTime(r.changed_at)}{r.changed_by ? `, by ${r.changed_by}` : ""}
            </div>
            {r.curr_hash && (
              <div className="mt-1.5 text-[12px] text-ink-soft dark:text-paper/50" title={r.curr_hash}>
                Audit hash <span className="font-mono">{r.curr_hash.slice(0, 12)}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- fraud */
const LVL = { low: "var(--color-ok)", medium: "var(--color-warn)", high: "var(--color-buoy)" };

/** Semicircle gauge 0-1 that sweeps up to the score once on mount. */
export function FraudGauge({ score = 0, level = "low", size = 220 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(score); return; }
    let raf, t0;
    const step = (t) => {
      t0 ??= t;
      const k = Math.min(1, (t - t0) / 1100);
      setShown(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = 80, c = Math.PI * r;
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`Fraud risk ${score.toFixed(2)}, ${level}`}>
        <path d="M20 100a80 80 0 0 1 160 0" fill="none" stroke="var(--color-paper-2)" strokeWidth="16" strokeLinecap="round" className="dark:[stroke:var(--color-night)]" />
        <path d="M20 100a80 80 0 0 1 160 0" fill="none" stroke={LVL[level]} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown)} />
        <text x="100" y="92" textAnchor="middle" className="fill-current" style={{ font: "52px Anton, Impact, sans-serif" }}>{shown.toFixed(2)}</text>
      </svg>
      <span className="-mt-1 rounded-full px-3 py-1 text-[13px] font-medium text-white" style={{ background: LVL[level] }}>
        {label(level)} risk
      </span>
    </div>
  );
}

export function ReasonBars({ reasons = [] }) {
  if (!reasons.length) return <p className="text-ink-soft">No risk factors stood out.</p>;
  return (
    <ul className="space-y-4">
      {reasons.map((r, i) => (
        <li key={r.feature} style={{ animationDelay: `${300 + i * 150}ms` }} className="animate-[reason-in_.5s_ease-out_both]">
          <div className="text-[14.5px]">{r.message}</div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2 dark:bg-night">
              <div className="h-full rounded-full bg-buoy" style={{ width: `${Math.round(r.impact * 100)}%` }} />
            </div>
            <span className="w-10 text-right text-[12px] text-ink-soft dark:text-paper/60">{Math.round(r.impact * 100)}%</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
