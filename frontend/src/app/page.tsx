"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader, Stat } from "@/components/ui";
import NetWorthChart from "@/components/charts/NetWorthChart";
import CategoryBreakdown from "@/components/charts/CategoryBreakdown";
import MerchantList from "@/components/MerchantList";
import { api } from "@/lib/api";
import { currency, shortDate, signedCurrency } from "@/lib/format";
import { AssetBreakdown, RothProgress, SpendingSummary } from "@/lib/types";

export default function OverviewPage() {
  const [spend, setSpend] = useState<SpendingSummary | null>(null);
  const [roth, setRoth] = useState<RothProgress | null>(null);
  const [assets, setAssets] = useState<AssetBreakdown | null>(null);

  useEffect(() => {
    api<SpendingSummary>("/metrics/spending").then(setSpend).catch(() => {});
    api<RothProgress | null>("/metrics/roth").then(setRoth).catch(() => {});
    api<AssetBreakdown>("/metrics/assets").then(setAssets).catch(() => {});
  }, []);

  const flowUp = spend ? spend.net_cash_flow >= 0 : true;

  return (
    <Shell>
      <PageHeader
        title="Overview"
        subtitle={
          spend
            ? `Pay period ${shortDate(spend.period_start)} – ${shortDate(spend.period_end)} · day ${spend.days_elapsed} of ${spend.days_total}`
            : "Your finances at a glance"
        }
      />

      <Card className="mb-4">
        <NetWorthChart />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Spent this period"
          value={spend ? currency(spend.total) : "—"}
          hint={
            spend
              ? `${currency(spend.daily_avg)}/day · ~${currency(spend.projected)} projected`
              : undefined
          }
        />
        <Stat
          label="Income this period"
          value={spend ? currency(spend.income) : "—"}
        />
        <Stat
          label="Net cash flow"
          value={spend ? signedCurrency(spend.net_cash_flow) : "—"}
          hint="income − spending"
          hintClass={flowUp ? "text-good" : "text-bad"}
        />
        <Stat
          label="Invested"
          value={assets ? currency(assets.invested) : "—"}
          hint={
            assets
              ? `${currency(assets.cash)} cash · ${currency(assets.debt)} debt`
              : undefined
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">Top merchants</h2>
            <span className="text-xs text-muted">this period</span>
          </div>
          <MerchantList data={spend?.top_merchants ?? []} />
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">By source</h2>
            <span className="text-xs text-muted">this period</span>
          </div>
          <CategoryBreakdown
            data={(spend?.by_source ?? []).map((s) => ({
              category: s.source,
              amount: s.amount,
            }))}
            emptyHint="No spending yet this period."
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Roth IRA progress</h2>
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
                {roth.percent}% • {currency(roth.remaining)} remaining in {roth.year}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Set a Roth goal in Settings.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium">Assets</h2>
          {assets ? (
            <AssetsBar assets={assets} />
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function AssetsBar({ assets }: { assets: AssetBreakdown }) {
  const rows = [
    { label: "Cash", value: assets.cash, color: "#3ecf8e" },
    { label: "Invested", value: assets.invested, color: "#5b8cff" },
  ];
  const positive = rows.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1;
  return (
    <div>
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-panel2">
        {rows.map((r) => (
          <div
            key={r.label}
            style={{ width: `${(Math.max(r.value, 0) / positive) * 100}%`, background: r.color }}
          />
        ))}
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: r.color }}
            />
            <span className="flex-1">{r.label}</span>
            <span className="tabular-nums">{currency(r.value)}</span>
          </li>
        ))}
        {assets.debt < 0 && (
          <li className="flex items-center gap-2 border-t border-line/60 pt-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-bad" />
            <span className="flex-1">Debt</span>
            <span className="tabular-nums text-bad">{currency(assets.debt)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
