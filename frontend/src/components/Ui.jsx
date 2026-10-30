import { EmptyArt } from "./Art";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        <h1 className="font-serif text-[38px] font-normal leading-[1.08] tracking-[-0.015em] sm:text-[46px]">{title}</h1>
        {subtitle && <p className="mt-3 text-[16px] text-ink-soft dark:text-paper/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

/** A row of big condensed figures separated by hairlines (not boxed cards). */
export function StatStrip({ children }) {
  return (
    <div className="grid divide-y hairline border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 [&>*]:border-line dark:[&>*]:border-white/10">
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, accent = false }) {
  return (
    <div className="px-1 py-6 sm:px-8 sm:first:pl-0">
      <div className="text-[14px] text-ink-soft dark:text-paper/70">{label}</div>
      <div className={`mt-2 font-display-tight text-[52px] ${accent ? "text-buoy" : ""}`}>{value}</div>
      {hint && <div className="mt-2 text-[13px] text-ink-soft dark:text-paper/60">{hint}</div>}
    </div>
  );
}

export const Skeleton = ({ className = "h-4 w-full" }) => <div className={`skeleton ${className}`} />;

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 py-2">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <EmptyArt className="mb-5 h-24 text-ink dark:text-paper" />
      <p className="font-serif text-[22px]">{title}</p>
      {hint && <p className="mt-2 max-w-sm text-ink-soft dark:text-paper/70">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ComingSoon({ title, subtitle, items = [] }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid overflow-hidden rounded-[36px] ring-1 ring-line/70 md:grid-cols-[1fr_1.2fr] dark:ring-white/10">
        <div className="grid place-items-center bg-sky p-10 text-ink">
          <EmptyArt className="h-40" />
        </div>
        <div className="bg-paper-2 p-8 sm:p-10 dark:bg-night-2">
          <p className="font-serif text-[24px] leading-snug">This screen is wired up and waiting for its build slot.</p>
          <p className="mt-3 text-ink-soft dark:text-paper/70">The route, the role check and the API call already work. What it will show:</p>
          <ul className="mt-5 space-y-3">
            {items.map((i) => (
              <li key={i} className="rounded-full border-[1.5px] border-ink px-5 py-2.5 text-[14px] dark:border-paper">{i}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
