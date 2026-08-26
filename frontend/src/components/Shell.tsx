"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/spending", label: "Spending" },
  { href: "/trends", label: "Trends" },
  { href: "/flow", label: "Money Flow" },
  { href: "/accounts", label: "Accounts" },
  { href: "/paychecks", label: "Paychecks" },
  { href: "/settings", label: "Settings" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api("/auth/me")
      .then(() => setReady(true))
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel px-3 py-6">
        <div className="px-3 pb-6">
          <div className="text-sm font-semibold">Finance</div>
          <div className="text-xs text-muted">Dashboard</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-panel2 text-white"
                    : "text-muted hover:bg-panel2 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="mt-4 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-panel2 hover:text-white"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-x-hidden px-8 py-8">{children}</main>
    </div>
  );
}
