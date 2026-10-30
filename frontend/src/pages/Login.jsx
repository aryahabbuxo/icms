import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { HOME } from "../lib/format";
import { Buoy, PolicyArt, RainScene } from "../components/Art";

const DEMO = [
  { email: "priya@demo.in", who: "Priya Sharma", role: "Policyholder" },
  { email: "ramesh@demo.in", who: "Ramesh K", role: "Adjuster" },
  { email: "kavitha@demo.in", who: "Kavitha R", role: "Senior adjuster" },
  { email: "admin@demo.in", who: "Claims admin", role: "Administrator" },
];

const STEPS = [
  { n: "01", title: "You tell us what happened", text: "Write it the way you'd say it, in English, Kannada or Hindi, and add your bills or FIR. The database checks your policy is active and the amount is within cover before anything else happens." },
  { n: "02", title: "The claim is read for you", text: "Language models sort the claim by type and urgency, pick out places, dates and amounts, and compare it with past claims to catch copies." },
  { n: "03", title: "An adjuster reviews it", text: "Claims reach the right specialist in your city. Risky ones go to a senior adjuster, with the reasons they were flagged written out." },
  { n: "04", title: "You're paid, and it's on record", text: "Settlement can never exceed your sum insured. Every status change is chained with SHA-256, so the history can't be quietly edited." },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const signIn = async (em, pw, key) => {
    setBusy(key);
    try {
      const u = await login(em, pw);
      toast.success(`Signed in as ${u.name}`);
      navigate(HOME[u.role], { replace: true });
    } catch (err) {
      toast.error(err?.message || "Sign-in failed", { id: "login" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full">
      {/* floating nav */}
      <div className="sticky top-0 z-20 px-4 pt-4 sm:px-8">
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-full bg-paper-2/90 px-5 py-2.5 ring-1 ring-line/60 backdrop-blur dark:bg-night-2/90 dark:ring-white/10">
          <a href="#top" className="flex items-center gap-2.5">
            <Buoy size={30} />
            <span className="font-serif text-[22px] font-medium tracking-tight">icms</span>
          </a>
          <div className="hidden items-center gap-7 text-[14px] text-ink-soft sm:flex dark:text-paper/70">
            <a href="#journey" className="hover:text-ink dark:hover:text-paper">How a claim moves</a>
            <a href="#stack" className="hover:text-ink dark:hover:text-paper">How it's built</a>
          </div>
          <a href="#signin" className="btn-primary py-2">Sign in</a>
        </nav>
      </div>

      {/* hero */}
      <header id="top" className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:pt-16">
        <div>
          <h1 className="max-w-xl font-serif text-[44px] font-normal leading-[1.04] tracking-[-0.02em] sm:text-[64px]">
            Insurance claims, read and settled with care.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-ink-soft dark:text-paper/75">
            File in your own words. ICMS reads the claim, routes it to the right adjuster and keeps a record nobody can rewrite.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#signin" className="btn-primary">Sign in to ICMS</a>
            <a href="#journey" className="btn-ghost">See how a claim moves</a>
          </div>
          <div className="mt-10 overflow-hidden rounded-[40px] bg-sky ring-1 ring-ink/10 dark:bg-night-2">
            <RainScene className="mx-auto block w-full max-w-[560px] text-ink dark:text-paper" />
          </div>
        </div>

        {/* sign-in card */}
        <section id="signin" className="self-start rounded-[36px] bg-paper-2 p-7 ring-1 ring-line/70 sm:p-9 lg:sticky lg:top-28 dark:bg-night-2 dark:ring-white/10">
          <h2 className="text-center font-serif text-[34px] font-normal tracking-tight">Sign in</h2>
          <div className="mt-6 grid grid-cols-2 text-center text-[15px]" role="tablist">
            {[["demo", "Demo accounts"], ["email", "Email"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`border-b-2 pb-2.5 transition ${tab === k ? "border-ink font-medium dark:border-paper" : "border-line text-ink-soft dark:border-white/15 dark:text-paper/60"}`}>
                {l}
              </button>
            ))}
          </div>

          {tab === "demo" ? (
            <div className="mt-7">
              <PolicyArt type="shield" className="mx-auto mb-6 h-28 text-ink dark:text-paper" />
              <div className="space-y-3">
                {DEMO.map((d) => (
                  <button key={d.email} disabled={!!busy} onClick={() => signIn(d.email, "Demo@123", d.email)}
                    className="group flex w-full items-center justify-between rounded-full border-[1.5px] border-ink px-5 py-3 text-left transition hover:bg-ink hover:text-paper disabled:opacity-60 dark:border-paper dark:hover:bg-paper dark:hover:text-ink">
                    <span className="font-medium">{d.who}</span>
                    <span className="flex items-center gap-2 text-[13px] opacity-70">
                      {busy === d.email ? <Buoy size={18} spin /> : d.role}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-center text-[13px] text-ink-soft dark:text-paper/60">Every demo account uses the password Demo@123.</p>
            </div>
          ) : (
            <form className="mt-7 space-y-4" onSubmit={(e) => { e.preventDefault(); signIn(email, password, "form"); }}>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="label" htmlFor="pw">Password</label>
                <input id="pw" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn-primary w-full py-3" disabled={!!busy}>
                {busy === "form" ? <Buoy size={18} spin /> : "Sign in"}
              </button>
            </form>
          )}
        </section>
      </header>

      {/* journey 01-04 */}
      <section id="journey" className="border-t hairline">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-8">
          <h2 className="max-w-lg font-serif text-[36px] leading-tight tracking-tight sm:text-[44px]">How a claim moves through ICMS</h2>
          <ol className="mt-12">
            {STEPS.map((s, i) => (
              <li key={s.n} className={`grid items-center gap-6 border-b hairline py-10 last:border-0 sm:grid-cols-2 sm:gap-16`}>
                <div className={i % 2 ? "sm:order-2" : ""}>
                  <h3 className="font-serif text-[26px] tracking-tight">{s.title}</h3>
                  <div className="my-3 h-[3px] w-12 rounded bg-buoy" />
                  <p className="max-w-md text-ink-soft dark:text-paper/70">{s.text}</p>
                </div>
                <div className={`font-display-tight select-none text-[150px] sm:text-[190px] ${i % 2 ? "pool-text sm:order-1 sm:text-left" : "buoy-text sm:text-right"}`} aria-hidden="true">
                  {s.n}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* two databases */}
      <section id="stack" className="bg-night text-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="font-display-tight text-[64px] uppercase sm:text-[88px]">Two<br />databases,<br />one claim</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-[32px] bg-night-2 p-7 ring-1 ring-white/10">
              <div className="mb-5 h-36 overflow-hidden rounded-full bg-sky text-ink"><PolicyArt type="shield" className="mx-auto h-full" /></div>
              <h3 className="font-serif text-[24px]">MySQL keeps the rules</h3>
              <p className="mt-2 text-[14px] text-paper/70">Policies, payments, assessments and settlements. Triggers refuse claims on lapsed policies, block over-settlement and hash-chain every status change.</p>
            </div>
            <div className="rounded-[32px] bg-night-2 p-7 ring-1 ring-white/10">
              <div className="mb-5 h-36 overflow-hidden rounded-full bg-blush text-ink"><PolicyArt type="travel" className="mx-auto h-full" /></div>
              <h3 className="font-serif text-[24px]">MongoDB keeps the evidence</h3>
              <p className="mt-2 text-[14px] text-paper/70">Narratives, uploaded bills, OCR text, language-model output and embeddings, each linked to its claim by claim ID.</p>
            </div>
          </div>
        </div>
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-[13px] text-paper/60 sm:px-8">
            <span className="flex items-center gap-2"><Buoy size={20} /> icms</span>
            <span>Database Management Systems (CD252IA), RV College of Engineering</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
