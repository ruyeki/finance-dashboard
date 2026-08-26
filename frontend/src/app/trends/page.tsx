"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import TrendChart from "@/components/charts/TrendChart";
import BalanceTrendChart from "@/components/charts/BalanceTrendChart";
import { api } from "@/lib/api";
import { currency } from "@/lib/format";
import { RothProgress, TrendPoint } from "@/lib/types";

interface BalanceSeries {
  account_id: number;
  name: string;
  type: string;
  series: { date: string; balance: number }[];
}

export default function TrendsPage() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [roth, setRoth] = useState<RothProgress | null>(null);
  const [balances, setBalances] = useState<BalanceSeries[]>([]);

  useEffect(() => {
    api<TrendPoint[]>("/metrics/trend?n=8").then(setTrend).catch(() => {});
    api<RothProgress | null>("/metrics/roth").then(setRoth).catch(() => {});
    api<BalanceSeries[]>("/metrics/balance-trends").then(setBalances).catch(() => {});
  }, []);

  const investments = balances.filter((b) =>
    ["roth", "brokerage", "_401k", "savings"].includes(b.type),
  );

  return (
    <Shell>
      <PageHeader title="Trends" subtitle="Spending and account growth over time" />

      <Card>
        <h2 className="mb-2 text-sm font-medium">Spending per pay period</h2>
        <TrendChart data={trend} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Roth IRA {roth?.year ?? ""}</h2>
          {roth ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {currency(roth.contributed_ytd)}
                </span>
                <span className="text-sm text-muted">of {currency(roth.limit)}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-good"
                  style={{ width: `${Math.min(roth.percent, 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted">
                {roth.percent}% · {currency(roth.remaining)} left to contribute
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Set a Roth goal in Settings.</p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-medium">Account balances over time</h2>
          <BalanceTrendChart data={investments} />
        </Card>
      </div>
    </Shell>
  );
}
