import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getNotifications } from "../api";
import { dateTime } from "../lib/format";
import { Buoy } from "./Art";

const NAV = {
  customer: [
    { to: "/c", label: "Overview", end: true },
    { to: "/c/claims/new", label: "File a claim" },
  ],
  adjuster: [{ to: "/adj", label: "Review queue", end: true }],
  admin: [
    { to: "/admin", label: "Dashboard", end: true },
    { to: "/admin/claims", label: "Claims" },
    { to: "/admin/ask", label: "Ask in English" },
    { to: "/admin/audit", label: "Audit trail" },
    { to: "/admin/models", label: "Models" },
  ],
  agent: [{ to: "/agent", label: "My policies", end: true }],
};

const ROLE_LABEL = { customer: "Policyholder", adjuster: "Adjuster", admin: "Administrator", agent: "Agent" };

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem("icms_theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("icms_theme", dark ? "dark" : "light"); } catch { /* storage blocked */ }
  }, [dark]);
  return [dark, setDark];
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  useEffect(() => { getNotifications().then(setItems).catch(() => {}); }, []);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const unread = items.filter((n) => !n.is_read).length;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`}
        className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5 dark:hover:bg-white/10">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-buoy ring-2 ring-paper-2 dark:ring-night-2" />}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-3 w-80 overflow-hidden rounded-[24px] bg-paper ring-1 ring-line shadow-[0_20px_50px_-20px_rgba(29,41,36,.35)] dark:bg-night-2 dark:ring-white/10">
          <div className="px-5 pb-2 pt-4 font-serif text-[18px]">Updates</div>
          {items.length === 0 && <p className="px-5 pb-5 text-ink-soft">Nothing new since you last looked.</p>}
          {items.map((n) => (
            <div key={n.notif_id} className="flex gap-3 border-t hairline px-5 py-3.5 text-[14px]">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-buoy"}`} />
              <div>
                <p>{n.message}</p>
                <p className="mt-0.5 text-[12px] text-ink-soft dark:text-paper/60">{dateTime(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dark, setDark] = useDarkMode();
  const nav = NAV[user.role] || [];
  const current = [...nav].reverse().find((n) => pathname.startsWith(n.to));

  useEffect(() => { document.title = `${current?.label || "Home"} — ICMS`; }, [current]);

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 px-3 pt-3 sm:px-6 sm:pt-4">
        <header className="mx-auto flex max-w-6xl items-center gap-3 rounded-full bg-paper-2/90 py-2 pl-4 pr-2 ring-1 ring-line/60 backdrop-blur dark:bg-night-2/90 dark:ring-white/10">
          <NavLink to={nav[0]?.to || "/"} className="flex shrink-0 items-center gap-2">
            <Buoy size={30} />
            <span className="font-serif text-[22px] font-medium tracking-tight">icms</span>
          </NavLink>

          <nav className="mx-auto flex min-w-0 gap-1 overflow-x-auto">
            {nav.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `whitespace-nowrap rounded-full px-4 py-2 text-[14px] transition ${isActive
                  ? "bg-ink text-paper dark:bg-paper dark:text-ink"
                  : "text-ink-soft hover:text-ink dark:text-paper/70 dark:hover:text-paper"}`}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setDark((d) => !d)} aria-label={dark ? "Use light theme" : "Use dark theme"}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5 dark:hover:bg-white/10">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NotificationBell />
            <div className="ml-1 hidden items-center gap-2.5 rounded-full bg-paper py-1 pl-1 pr-4 ring-1 ring-line/70 sm:flex dark:bg-night dark:ring-white/10">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-sky font-serif text-[14px] text-ink">
                {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="leading-tight">
                <div className="text-[13px] font-medium">{user.name}</div>
                <div className="text-[11px] text-ink-soft dark:text-paper/60">{ROLE_LABEL[user.role]}</div>
              </div>
            </div>
            <button onClick={() => { logout(); navigate("/login"); }} aria-label="Sign out"
              className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink dark:text-paper/60 dark:hover:bg-white/10">
              <LogOut size={17} />
            </button>
          </div>
        </header>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
