"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, NetworkError } from "@/lib/api";
import { daysUntil, relativeDays, weekdayDate } from "@/lib/format";
import type { Account, Paycheck, SpendingSummary } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  hint?: string;
  countOf?: "accounts" | "paychecks";
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/spending", label: "Spending" },
  { href: "/trends", label: "Trends" },
  { href: "/flow", label: "Money Flow", hint: "•" },
  { href: "/accounts", label: "Accounts", countOf: "accounts" },
  { href: "/paychecks", label: "Paychecks", countOf: "paychecks" },
  { href: "/settings", label: "Settings" },
];

/**
 * The pay-period summary, fetched once by the Shell.
 *
 * Every screen shows the same period framing in its subtitle and most of them
 * need the same figures, so fetching it per-page would mean four identical
 * requests on every navigation.
 */
const SummaryContext = createContext<SpendingSummary | null>(null);

export function useSummary(): SpendingSummary | null {
  return useContext(SummaryContext);
}

/**
 * `bare` drops the default page padding. Redesigned screens set it, because
 * their `PageHead` / `Module` primitives are full-bleed and carry their own
 * 32px gutters; the screens still on the old `Card` layout keep the padding.
 */
export default function Shell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  bare?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [counts, setCounts] = useState<{ accounts?: number; paychecks?: number }>({});
  const [env, setEnv] = useState<string | null>(null);

  useEffect(() => {
    api("/auth/me")
      .then(() => setReady(true))
      .catch((err) => {
        // A missing session and an unreachable backend are different problems.
        // Bouncing both to /login sends you to re-enter a password that was
        // never the issue.
        if (err instanceof NetworkError) {
          setUnreachable(err.base);
          return;
        }
        if (err instanceof ApiError && err.status !== 401) {
          setUnreachable(null);
        }
        router.replace("/login");
      });
  }, [router]);

  // Sidebar furniture. Each piece degrades on its own: a failed count just
  // hides that badge rather than blanking the nav.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const [s, a, p, h] = await Promise.allSettled([
        api<SpendingSummary>("/metrics/spending"),
        api<Account[]>("/accounts"),
        api<Paycheck[]>("/paychecks"),
        api<{ plaid_env?: string }>("/health"),
      ]);
      if (!live) return;
      if (s.status === "fulfilled") setSummary(s.value);
      setCounts({
        accounts: a.status === "fulfilled" ? a.value.length : undefined,
        paychecks: p.status === "fulfilled" ? p.value.length : undefined,
      });
      if (h.status === "fulfilled" && h.value.plaid_env) setEnv(h.value.plaid_env);
    })();
    return () => {
      live = false;
    };
  }, [ready]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (unreachable) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md">
          <h1 className="text-h2 font-semibold text-fg">Cannot reach the API</h1>
          <p className="mt-2 text-body text-muted">
            Nothing answered at{" "}
            <span className="font-mono text-caption text-fg">{unreachable}</span>.
          </p>
          <p className="mt-3 text-caption text-muted">
            Check that the backend is running, and that it is reachable at the
            same host you loaded this page from. You are not signed out.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  const payday = summary?.period_end;

  return (
    <SummaryContext.Provider value={summary}>
      <div className="flex min-h-screen">
        <aside className="flex w-52 shrink-0 flex-col border-r border-line py-[26px]">
          <div className="px-5 pb-6">
            <div className="text-h2 font-semibold text-fg">Finance</div>
            <div className="mt-0.5 font-mono text-micro uppercase text-muted">
              {env ? `${env} · USD` : "USD"}
            </div>
          </div>

          <nav className="flex flex-col">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const badge =
                item.hint ??
                (item.countOf ? counts[item.countOf]?.toString() : undefined);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between border-l-2 py-[9px] pl-[18px] pr-5 text-body transition-colors ${
                    active
                      ? "border-accent bg-[#171b23] text-fg"
                      : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  <span>{item.label}</span>
                  {badge && (
                    <span className="font-mono text-eyebrow text-dim">{badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {payday && (
            <div className="mx-5 mt-6 border-t border-line pt-4">
              <div className="font-mono text-eyebrow uppercase text-muted">
                Next payday
              </div>
              <div className="mt-1.5 text-body text-fg">
                {weekdayDate(payday)} · {relativeDays(daysUntil(payday))}
              </div>
              {/*
                "$N discretionary left" belongs here per the design, but it needs
                the tier map and the per-period discretionary budget, which are
                Phase 2 backend work. Omitted rather than faked.
              */}
            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={logout}
            className="px-5 py-2 text-left text-body text-muted transition-colors hover:text-fg"
          >
            Sign out
          </button>
        </aside>

        <main className={`min-w-0 flex-1 ${bare ? "" : "px-8 py-8"}`}>{children}</main>
      </div>
    </SummaryContext.Provider>
  );
}
