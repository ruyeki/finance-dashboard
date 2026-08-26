"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader, Stat } from "@/components/ui";
import CategoryBreakdown from "@/components/charts/CategoryBreakdown";
import MerchantList from "@/components/MerchantList";
import { api } from "@/lib/api";
import { currency, shortDate, signedCurrency } from "@/lib/format";
import { CATEGORIES } from "@/lib/categories";
import { SpendingSummary, Transaction } from "@/lib/types";

export default function SpendingPage() {
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);

  function loadTxns(start: string, end: string) {
    api<Transaction[]>(`/transactions?start=${start}&end=${end}&limit=300`)
      .then(setTxns)
      .catch(() => {});
  }

  function loadSummary() {
    api<SpendingSummary>("/metrics/spending")
      .then((s) => {
        setSummary(s);
        loadTxns(s.period_start, s.period_end);
      })
      .catch(() => {});
  }

  useEffect(loadSummary, []);

  async function recategorize(id: number, category: string) {
    const updated = await api<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    });
    setTxns((prev) => prev.map((t) => (t.id === id ? updated : t)));
    api<SpendingSummary>("/metrics/spending").then(setSummary).catch(() => {});
  }

  const deltaDown = summary ? summary.delta <= 0 : true;

  return (
    <Shell>
      <PageHeader
        title="Spending"
        subtitle={
          summary
            ? `${shortDate(summary.period_start)} – ${shortDate(summary.period_end)} · day ${summary.days_elapsed} of ${summary.days_total}`
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Spent this period" value={summary ? currency(summary.total) : "—"} />
        <Stat
          label="Projected"
          value={summary ? currency(summary.projected) : "—"}
          hint={summary ? `${currency(summary.daily_avg)}/day` : undefined}
        />
        <Stat
          label="vs last period"
          value={summary ? signedCurrency(summary.delta) : "—"}
          hint={summary ? `last: ${currency(summary.previous_total)}` : undefined}
          hintClass={deltaDown ? "text-good" : "text-bad"}
        />
        <Stat label="Trailing avg" value={summary ? currency(summary.average) : "—"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-medium">By source</h2>
          <CategoryBreakdown
            data={(summary?.by_source ?? []).map((s) => ({
              category: s.source,
              amount: s.amount,
            }))}
            emptyHint="No spending yet this period."
          />
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-medium">Top merchants</h2>
          <MerchantList data={summary?.top_merchants ?? []} />
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 text-sm font-medium">By category</h2>
        <CategoryBreakdown
          data={summary?.by_category ?? []}
          emptyHint="Add a Gemini key (or categorize transactions below) to split spending into food, gas, etc."
        />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 text-sm font-medium">Transactions this period</h2>
        <p className="mb-4 text-xs text-muted">
          Transfers &amp; income are shown but excluded from spending totals. Change a
          category and it becomes a reusable rule.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Merchant</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-t border-line/60">
                  <td className="py-2 pr-4 text-muted">{shortDate(t.date)}</td>
                  <td className="py-2 pr-4">
                    {t.merchant_name ?? t.raw_name}
                    {t.is_transfer && (
                      <span className="ml-2 rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
                        transfer
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={t.category}
                      onChange={(e) => recategorize(t.id, e.target.value)}
                      className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs outline-none focus:border-accent"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums ${
                      t.is_income ? "text-good" : ""
                    }`}
                  >
                    {t.is_income
                      ? `+${currency(Math.abs(t.amount), { cents: true })}`
                      : currency(t.amount, { cents: true })}
                  </td>
                </tr>
              ))}
              {txns.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No transactions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
