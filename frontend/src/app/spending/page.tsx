"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader, Stat } from "@/components/ui";
import CategoryDonut from "@/components/charts/CategoryDonut";
import { api } from "@/lib/api";
import { colorFor, currency, shortDate, signedCurrency } from "@/lib/format";
import { CATEGORIES } from "@/lib/categories";
import { SpendingSummary, Transaction } from "@/lib/types";

export default function SpendingPage() {
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);

  function loadTxns(start: string, end: string) {
    api<Transaction[]>(
      `/transactions?start=${start}&end=${end}&limit=200`,
    )
      .then(setTxns)
      .catch(() => {});
  }

  useEffect(() => {
    api<SpendingSummary>("/metrics/spending")
      .then((s) => {
        setSummary(s);
        loadTxns(s.period_start, s.period_end);
      })
      .catch(() => {});
  }, []);

  async function recategorize(id: number, category: string) {
    const updated = await api<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    });
    setTxns((prev) => prev.map((t) => (t.id === id ? updated : t)));
    // Refresh summary totals after a change.
    api<SpendingSummary>("/metrics/spending").then(setSummary).catch(() => {});
  }

  const max = summary?.by_category[0]?.amount ?? 1;
  const deltaDown = summary ? summary.delta <= 0 : true;

  return (
    <Shell>
      <PageHeader
        title="Spending"
        subtitle={
          summary
            ? `${shortDate(summary.period_start)} – ${shortDate(summary.period_end)} · ${summary.cadence}`
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Spent this period" value={summary ? currency(summary.total) : "—"} />
        <Stat
          label="vs last period"
          value={summary ? signedCurrency(summary.delta) : "—"}
          hint={summary ? `last: ${currency(summary.previous_total)}` : undefined}
          hintClass={deltaDown ? "text-good" : "text-bad"}
        />
        <Stat label="Trailing average" value={summary ? currency(summary.average) : "—"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-medium">By category</h2>
          <CategoryDonut data={summary?.by_category ?? []} />
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium">Category breakdown</h2>
          <div className="space-y-3">
            {(summary?.by_category ?? []).map((c, i) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: colorFor(i) }}
                    />
                    {c.category}
                  </span>
                  <span className="tabular-nums">{currency(c.amount, { cents: true })}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(c.amount / max) * 100}%`, background: colorFor(i) }}
                  />
                </div>
              </div>
            ))}
            {summary && summary.by_category.length === 0 && (
              <p className="text-sm text-muted">No spending this period.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 text-sm font-medium">Transactions this period</h2>
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
                  <td className="py-2 pr-4">{t.merchant_name ?? t.raw_name}</td>
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
