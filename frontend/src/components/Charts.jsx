// Chart.js wrappers in the ICMS style. Single-series charts (no legend; the card title names the data),
// 2px lines with a 10% wash, bars <= 24px thick with a 4px rounded data-end, hairline grid, hover tooltips,
// and a table view under every chart so no value depends on colour or hover alone.
import { useEffect, useState } from "react";
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip);

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const dark = document.documentElement.classList.contains("dark");
  return {
    series: v("--color-chart-1") || "#008a7b",
    hi: v("--color-chart-hi") || "#d2492a",
    text: dark ? "rgba(242,238,227,.72)" : "#5d6862",
    grid: dark ? "rgba(255,255,255,.08)" : "#e2dccb",
    tipBg: dark ? "#f2eee3" : "#1d2924",
    tipFg: dark ? "#1d2924" : "#f2eee3",
    dark,
  };
}

/** Re-reads colours when the theme class on <html> changes. */
function useChartTheme() {
  const [t, setT] = useState(readTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setT(readTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

const FONT = { family: '"DM Sans Variable", "DM Sans", system-ui, sans-serif', size: 12 };

function base(t, { horizontal = false, format = (v) => v.toLocaleString("en-IN") } = {}) {
  const valueAxis = {
    beginAtZero: true, border: { display: false },
    grid: { color: t.grid, lineWidth: 1, drawTicks: false },
    ticks: { color: t.text, font: FONT, padding: 8, maxTicksLimit: 5, callback: (v) => format(v) },
  };
  const catAxis = { border: { color: t.grid }, grid: { display: false }, ticks: { color: t.text, font: FONT, padding: 6 } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
    animation: { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.tipBg, titleColor: t.tipFg, bodyColor: t.tipFg, padding: 10, cornerRadius: 10,
        displayColors: false, titleFont: { ...FONT, weight: "600" }, bodyFont: FONT,
        callbacks: { label: (c) => format(horizontal ? c.parsed.x : c.parsed.y) },
      },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  };
}

function TableView({ labels, values, unit, format }) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer text-ink-soft underline decoration-line underline-offset-4 dark:text-paper/60">Show as table</summary>
      <table className="mt-2 w-full">
        <tbody>
          {labels.map((l, i) => (
            <tr key={l} className="border-b hairline"><td className="py-1.5">{l}</td><td className="text-right tabular-nums">{format(values[i])}{unit}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function LineChart({ labels, values, height = 240, format, label = "" }) {
  const t = useChartTheme();
  const fmt = format || ((v) => v.toLocaleString("en-IN"));
  const data = {
    labels,
    datasets: [{
      label, data: values, borderColor: t.series, borderWidth: 2, tension: 0.3, fill: true,
      backgroundColor: t.series + "1a", pointRadius: values.map((_, i) => (i === values.length - 1 ? 4 : 0)),
      pointHoverRadius: 5, pointBackgroundColor: t.series, pointBorderColor: t.dark ? "#1d2436" : "#f2eee3", pointBorderWidth: 2,
    }],
  };
  return (
    <>
      <div style={{ height }} role="img" aria-label={label}><Line data={data} options={base(t, { format: fmt })} /></div>
      <TableView labels={labels} values={values} format={fmt} />
    </>
  );
}

/** highlight(i) -> true paints that bar in the reserved high-risk colour. */
export function BarChart({ labels, values, height = 240, horizontal = false, highlight, format, label = "" }) {
  const t = useChartTheme();
  const fmt = format || ((v) => v.toLocaleString("en-IN"));
  const colors = values.map((_, i) => (highlight?.(i) ? t.hi : t.series));
  const data = {
    labels,
    datasets: [{
      label, data: values, backgroundColor: colors, hoverBackgroundColor: colors,
      maxBarThickness: 24, borderRadius: 4, borderSkipped: "start", categoryPercentage: 0.8, barPercentage: 0.9,
    }],
  };
  return (
    <>
      <div style={{ height }} role="img" aria-label={label}><Bar data={data} options={base(t, { horizontal, format: fmt })} /></div>
      <TableView labels={labels} values={values} format={fmt} />
    </>
  );
}

export function ChartCard({ title, note, children, className = "" }) {
  return (
    <section className={`rounded-[32px] bg-white/60 p-6 ring-1 ring-line/70 sm:p-7 dark:bg-night-2 dark:ring-white/10 ${className}`}>
      <h2 className="font-serif text-[22px] leading-snug">{title}</h2>
      {note && <p className="mt-1 text-[13px] text-ink-soft dark:text-paper/60">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
