"use client";

import { currency, shortDate } from "@/lib/format";
import { CATEGORIES, tierFor } from "@/lib/categories";
import type { Transaction } from "@/lib/types";

type ChipKind = "fixed" | "essential" | "chosen" | "income" | "transfer" | "other";

const CHIP: Record<ChipKind, { label: string; bg: string; fg: string }> = {
  fixed: { label: "Fixed", bg: "#1a1f27", fg: "#8b93a7" },
  essential: { label: "Essential", bg: "#1a1f27", fg: "#c2c9d4" },
  chosen: { label: "Chosen", bg: "#231619", fg: "#ff9a8f" },
  income: { label: "Income", bg: "#15211c", fg: "#3ecf8e" },
  transfer: { label: "Transfer", bg: "#1a1f27", fg: "#5c6474" },
  // Taxes and fees are spending but not a choice, and the handoff's four chips
  // have nowhere to put them. Neutral rather than mislabelled as fixed.
  other: { label: "Other", bg: "#1a1f27", fg: "#5c6474" },
};

function chipFor(t: Transaction): ChipKind {
  if (t.is_income) return "income";
  if (t.is_transfer) return "transfer";
  const tier = tierFor(t.category);
  if (tier === "fixed") return "fixed";
  if (tier === "essential") return "essential";
  if (tier === "discretionary") return "chosen";
  return "other";
}

export function TransactionsTable({
  rows,
  onRecategorize,
}: {
  rows: Transaction[];
  onRecategorize: (id: number, category: string) => void;
}) {
  if (!rows.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        No transactions in this period yet.
      </p>
    );
  }

  const cols = "86px 1fr 190px 132px 110px";

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[860px]">
        <div
          className="grid gap-3 border-b border-line pb-2 font-mono text-eyebrow uppercase text-dim"
          style={{ gridTemplateColumns: cols }}
        >
          <span>Date</span>
          <span>Merchant</span>
          <span>Category</span>
          <span>Tier</span>
          <span className="text-right">Amount</span>
        </div>

        {rows.map((t) => {
          const chip = CHIP[chipFor(t)];
          return (
            <div
              key={t.id}
              className="grid items-center gap-3 border-b border-line2 py-[11px]"
              style={{ gridTemplateColumns: cols }}
            >
              <span className="font-mono text-caption text-muted">
                {shortDate(t.date)}
              </span>

              <span className="min-w-0 truncate text-body text-fg">
                {t.merchant_name ?? t.raw_name}
              </span>

              {/* Changing this writes a reusable rule server-side, so it stays
                  the control rather than becoming static text. */}
              <select
                value={t.category}
                onChange={(e) => onRecategorize(t.id, e.target.value)}
                aria-label={`Category for ${t.merchant_name ?? t.raw_name}`}
                className="w-full min-w-0 rounded border border-transparent bg-transparent py-1 text-body text-muted outline-none hover:border-line focus:border-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-panel2 text-fg">
                    {c}
                  </option>
                ))}
              </select>

              <span>
                <span
                  className="inline-block rounded px-2 py-[3px] font-mono text-eyebrow uppercase tracking-[0.06em]"
                  style={{ background: chip.bg, color: chip.fg }}
                >
                  {chip.label}
                </span>
              </span>

              <span
                className={`text-right font-mono text-body tabular-nums ${
                  t.is_income ? "text-good" : "text-fg"
                }`}
              >
                {t.is_income
                  ? `+${currency(Math.abs(t.amount), { cents: true })}`
                  : currency(t.amount, { cents: true })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
