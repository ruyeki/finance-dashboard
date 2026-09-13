"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import {
  BasisPills,
  Module,
  ModuleHead,
  PageHead,
  Split,
  StatRow,
  StatTile,
} from "@/components/primitives";
import { KeepRateBars } from "@/components/dash/bars";
import { AccountBalances } from "@/components/dash/charts";
import { Donut } from "@/components/dash/donut";
import { api } from "@/lib/api";
import { currency, share, shortDate, signedCurrency } from "@/lib/format";
import type {
  Account,
  AssetBreakdown,
  KeepRatePoint,
  TrendPoint,
} from "@/lib/types";

type Series = { name: string; series: { date: string; balance: number }[] };

export default function TrendsPage() {
  return (
    <Shell bare>
      <TrendsContent />
    </Shell>
  );
}

function TrendsContent() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [balances, setBalances] = useState<Series[]>([]);
  const [keep, setKeep] = useState<KeepRatePoint[]>([]);
  const [assets, setAssets] = useState<AssetBreakdown | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const soft = () => {};
    api<TrendPoint[]>("/metrics/trend?n=8").then(setTrend).catch(soft);
    api<Series[]>("/metrics/balance-trends").then(setBalances).catch(soft);
    api<KeepRatePoint[]>("/metrics/keep-rate?n=12").then(setKeep).catch(soft);
    api<AssetBreakdown>("/metrics/assets").then(setAssets).catch(soft);
    api<Account[]>("/accounts").then(setAccounts).catch(soft);
  }, []);

  const stats = useMemo(() => {
    if (!trend.length) return null;
    const fixed = trend.map((t) => t.by_tier?.fixed ?? 0);
    const disc = trend.map((t) => t.by_tier?.discretionary ?? 0);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const fixedMean = mean(fixed);
    return {
      average: trend[0]?.average ?? 0,
      periods: trend.length,
      fixedFloor: fixedMean,
      // Spread around the floor, as the "+/-" figure beside it.
      fixedSpread: Math.max(...fixed) - Math.min(...fixed),
      discLow: Math.min(...disc),
      discHigh: Math.max(...disc),
      discSwing: Math.max(...disc) - Math.min(...disc),
    };
  }, [trend]);

  const netWorth = useMemo(
    () => accounts.reduce((s, a) => s + a.current_balance, 0),
    [accounts],
  );

  const investedDelta = useMemo(() => {
    // First-to-last change across every snapshot series, as a proxy for growth.
    let first = 0;
    let last = 0;
    for (const s of balances) {
      if (!s.series.length) continue;
      first += s.series[0].balance;
      last += s.series[s.series.length - 1].balance;
    }
    return last - first;
  }, [balances]);

  // Most recent completed period, for the by-tier donut.
  const latestPeriod = useMemo(
    () =>
      trend.length
        ? [...trend].sort((a, b) => b.period_start.localeCompare(a.period_start))[0]
        : null,
    [trend],
  );

  const tierSlices = useMemo(
    () =>
      latestPeriod
        ? [
            { label: "Fixed", value: latestPeriod.by_tier?.fixed ?? 0, color: "#3b4250" },
            { label: "Essentials", value: latestPeriod.by_tier?.essential ?? 0, color: "#6d7686" },
            { label: "Discretionary", value: latestPeriod.by_tier?.discretionary ?? 0, color: "#ff6b6b" },
          ]
        : [],
    [latestPeriod],
  );

  const assetSlices = useMemo(
    () =>
      [...accounts]
        .filter((a) => a.current_balance !== 0)
        .sort((a, b) => Math.abs(b.current_balance) - Math.abs(a.current_balance))
        .map((a) => ({
          label: a.name,
          value: Math.abs(a.current_balance),
          color: a.current_balance < 0 ? "#ff6b6b" : undefined,
        })),
    [accounts],
  );

  return (
    <>
      <PageHead
        title="Trends"
        subtitle={
          trend.length
            ? `${trend.length} pay periods · ${balances.length} snapshot series`
            : "Loading…"
        }
        actions={<BasisPills />}
      />

      <StatRow>
        <StatTile
          label="Average period"
          value={stats ? currency(stats.average) : "—"}
          delta={stats ? `${stats.periods} periods` : undefined}
          note="Complete periods only"
        />
        <StatTile
          label="Fixed cost floor"
          value={stats ? currency(stats.fixedFloor) : "—"}
          delta={stats ? `±${currency(stats.fixedSpread)}` : undefined}
          deltaTone="good"
          note="Utilities, subscriptions, insurance, rent"
        />
        <StatTile
          label="Discretionary swing"
          value={stats ? currency(stats.discSwing) : "—"}
          delta="high to low"
          deltaTone="warn"
          note={
            stats
              ? `${currency(stats.discLow)} to ${currency(stats.discHigh)} across ${stats.periods} periods`
              : undefined
          }
        />
        <StatTile
          label="Invested"
          value={assets ? currency(assets.invested) : "—"}
          delta={balances.length ? signedCurrency(investedDelta) : undefined}
          deltaTone={investedDelta >= 0 ? "good" : "bad"}
          note={
            assets && netWorth > 0
              ? `${share((assets.invested / netWorth) * 100)} of net worth`
              : undefined
          }
        />
      </StatRow>

      <Module>
        <ModuleHead
          title="This period's spending by tier"
          subtitle={
            latestPeriod
              ? `${shortDate(latestPeriod.period_start)} – ${shortDate(latestPeriod.period_end)} · fixed vs essentials vs discretionary`
              : "No completed periods yet."
          }
        />
        <Donut
          data={tierSlices}
          centerLabel="spent"
          centerValue={latestPeriod ? currency(latestPeriod.total) : undefined}
          emptyHint="No completed periods yet."
        />
      </Module>

      <Split>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Keep rate"
            subtitle="Share of gross that stays yours — 401(k) plus cash left over."
          />
          <KeepRateBars data={keep} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Account balances"
            subtitle="Snapshot series, per account."
          />
          <AccountBalances data={balances} />
        </div>
      </Split>

      <Module>
        <ModuleHead
          title="Assets and liabilities"
          subtitle="Every account by size; liabilities in red, net worth in the center."
        />
        <Donut
          data={assetSlices}
          centerLabel="Net worth"
          centerValue={currency(netWorth)}
          emptyHint="No accounts yet."
        />
      </Module>
    </>
  );
}
