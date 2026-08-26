"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader, Stat } from "@/components/ui";
import CategoryDonut from "@/components/charts/CategoryDonut";
import TrendChart from "@/components/charts/TrendChart";
import { api } from "@/lib/api";
import { currency, shortDate, signedCurrency } from "@/lib/format";
import {
  ACCOUNT_TYPE_LABELS,
  AccountType,
  NetWorth,
  RothProgress,
  SpendingSummary,
  TrendPoint,
} from "@/lib/types";

export default function OverviewPage() {
  const [nw, setNw] = useState<NetWorth | null>(null);
  const [spend, setSpend] = useState<SpendingSummary | null>(null);
  const [roth, setRoth] = useState<RothProgress | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    api<NetWorth>("/metrics/networth").then(setNw).catch(() => {});
    api<SpendingSummary>("/metrics/spending").then(setSpend).catch(() => {});
    api<RothProgress | null>("/metrics/roth").then(setRoth).catch(() => {});
    api<TrendPoint[]>("/metrics/trend?n=8").then(setTrend).catch(() => {});
  }, []);

  const deltaDown = spend ? spend.delta <= 0 : true;

  return (
    <Shell>
      <PageHeader
        title="Overview"
        subtitle={
          spend
            ? `Pay period ${shortDate(spend.period_start)} – ${shortDate(spend.period_end)}`
            : "Your finances at a glance"
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Net worth"
          value={nw ? currency(nw.total) : "—"}
        />
        <Stat
          label="Spent this period"
          value={spend ? currency(spend.total) : "—"}
          hint={
            spend
              ? `${signedCurrency(spend.delta)} vs last period`
              : undefined
          }
          hintClass={deltaDown ? "text-good" : "text-bad"}
        />
        <Stat
          label="Income this period"
          value={spend ? currency(spend.income) : "—"}
        />
        <Stat
          label="Avg / period"
          value={spend ? currency(spend.average) : "—"}
          hint="trailing periods"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Spending trend</h2>
            <span className="text-xs text-muted">per pay period</span>
          </div>
          <TrendChart data={trend} />
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-medium">This period by category</h2>
          <CategoryDonut data={spend?.by_category ?? []} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Roth IRA progress</h2>
          {roth ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {currency(roth.contributed_ytd)}
                </span>
                <span className="text-sm text-muted">
                  of {currency(roth.limit)}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-good"
                  style={{ width: `${Math.min(roth.percent, 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted">
                {roth.percent}% • {currency(roth.remaining)} remaining in {roth.year}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Set a Roth goal in Settings.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Accounts by type</h2>
          {nw ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {Object.entries(nw.by_type).map(([type, bal]) => (
                <div
                  key={type}
                  className="flex items-center justify-between border-b border-line/60 py-1.5"
                >
                  <span className="text-sm text-muted">
                    {ACCOUNT_TYPE_LABELS[type as AccountType] ?? type}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {currency(bal)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Card>
      </div>
    </Shell>
  );
}
