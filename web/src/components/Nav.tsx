"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>{children}</svg>
);

const LINKS: { href: string; label: string; short: string; icon: ReactNode }[] = [
  { href: "/", label: "Overview", short: "Home", icon: <Icon><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Icon> },
  { href: "/sales", label: "Sales bills", short: "Sales", icon: <Icon><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Icon> },
  { href: "/purchases", label: "Purchase bills", short: "Buying", icon: <Icon><path d="M4 7h16l-1.5 12h-13z" /><path d="M9 7a3 3 0 0 1 6 0" /></Icon> },
  { href: "/stock", label: "Stock", short: "Stock", icon: <Icon><path d="M3 8l9-5 9 5-9 5z" /><path d="M3 8v8l9 5 9-5V8" /></Icon> },
  { href: "/gst", label: "GST", short: "GST", icon: <Icon><path d="M5 19L19 5" /><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /></Icon> },
  { href: "/forecast", label: "Forecast", short: "Forecast", icon: <Icon><path d="M3 17l5-6 4 3 8-9" /><path d="M15 5h5v5" /></Icon> },
];

export function Nav() {
  const path = usePathname();
  const [canLogout, setCanLogout] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCanLogout(Boolean(d.required && d.authed)))
      .catch(() => {});
  }, [path]);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <>
      <aside className="side noprint">
        <Link href="/" className="brand">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
            <rect x="1.5" y="1.5" width="31" height="31" rx="5" fill="none" stroke="var(--blue)" strokeWidth="2" />
            <path d="M8 11h18M8 17h18M8 23h11" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            <b>Shop Ledger</b>
            <span>Bills, stock and GST</span>
          </div>
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
              {l.icon}
              {l.label}
            </Link>
          ))}
        </nav>
        {canLogout && (
          <button type="button" className="btn small" style={{ margin: "16px 14px" }} onClick={logout}>Log out</button>
        )}
      </aside>
      <nav className="tabbar noprint" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
            {l.icon}
            {l.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
