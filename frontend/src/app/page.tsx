"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell, { useSummary } from "@/components/Shell";
import {
  BasisPills,
  Module,
  ModuleHead,
  PageHead,
  Split,
  StatRow,
  StatTile,
} from "@/components/primitives";
import { NetWorthArea } from "@/components/dash/charts";
import { BandRow, type Band } from "@/components/dash/BandRow";
import { DeviationRows, MerchantRows } from "@/components/dash/rows";
import {
  buildInsights,
  RecurringList,
  RetirementPace,
  WorthWatching,
} from "@/components/dash/notes";
import { api } from "@/lib/api";
import {
  currency,
  daysUntil,
  periodLabel,
  share,
  shortDate,
  signedCurrency,
  signedPoints,
} from "@/lib/format";
import type {
  ContributionGoal,
  FlowData,
  KeepRatePoint,
  NetWorthPoint,
  RecurringCharges,
} from "@/lib/types";

export default function OverviewPage() {
  return (
    <Shell bare>
      <OverviewContent />
    </Shell>
  );
}

function OverviewContent() {
  const summary = useSummary();
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [goals, setGoals] = useState<ContributionGoal[]>([]);
  const [recurring, setRecurring] = useState<RecurringCharges | null>(null);
  const [keep, setKeep] = useState<KeepRatePoint[]>([]);
  const [nw, setNw] = useState<NetWorthPoint[]>([]);

  useEffect(() => {
    const soft = () => {};
    api<FlowData>("/metrics/flow").then(setFlow).catch(soft);
    api<ContributionGoal[]>("/metrics/goals").then(setGoals).catch(soft);
    api<RecurringCharges>("/metrics/recurring").then(setRecurring).catch(soft);
    api<KeepRatePoint[]>("/metrics/keep-rate?n=12").then(setKeep).catch(soft);
    api<NetWorthPoint[]>("/metrics/networth-history?days=30")
      .then(setNw)
      .catch(soft);
  }, []);

  const netWorth = useMemo(() => {
    if (!nw.length) return null;
    const last = nw[nw.length - 1].net_worth;
    const first = nw[0].net_worth;
    return {
      value: last,
      change: last - first,
      pct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0,
    };
  }, [nw]);

  const bands: Band[] = useMemo(() => {
    if (!flow) return [];
    const tone = (key: string): Band["tone"] =>
      key === "k401" || key === "kept"
        ? "good"
        : key === "discretionary"
          ? "bad"
          : key === "fixed" || key === "unclassified"
            ? "neutral2"
            : "neutral";
    return [
      ...flow.split1.filter((n) => n.key !== "takehome"),
      ...flow.split2,
    ].map((n) => ({ key: n.key, label: n.label, value: n.value, tone: tone(n.key) }));
  }, [flow]);

  const deviations = useMemo(() => {
    if (!summary) return [];
    const avgs = summary.category_averages ?? {};
    return summary.by_category.map((c) => ({
      label: c.category,
      value: c.amount,
      average: avgs[c.category] ?? 0,
    }));
  }, [summary]);

  const insights = useMemo(() => buildInsights(summary, goals), [summary, goals]);

  const keepNow = summary?.keep_rate ?? null;
  const keepAvg = keep.length ? keep[keep.length - 1].average : null;
  const avgPerDay =
    summary && summary.days_total > 0 ? summary.average / summary.days_total : 0;
  const daysLeft = summary ? daysUntil(summary.period_end) : 0;

  return (
    <>
      <PageHead
        title="Overview"
        subtitle={summary ? periodLabel(summary) : "Loading…"}
        actions={<BasisPills />}
      />

      <StatRow>
        <StatTile
          label="Net worth"
          value={netWorth ? currency(netWorth.value) : "—"}
          delta={netWorth ? signedCurrency(netWorth.change) : undefined}
          deltaTone={netWorth && netWorth.change >= 0 ? "good" : "bad"}
          note={
            netWorth
              ? `Past 30 days · ${netWorth.pct >= 0 ? "+" : "−"}${Math.abs(netWorth.pct).toFixed(1)}%`
              : undefined
          }
        />
        <StatTile
          label="Savings rate"
          value={keepNow !== null ? share(keepNow) : "—"}
          valueTone={
            keepNow !== null && keepAvg !== null && keepNow < keepAvg ? "warn" : "fg"
          }
          delta={
            keepNow !== null && keepAvg !== null
              ? signedPoints(keepNow - keepAvg)
              : undefined
          }
          deltaTone={
            keepNow !== null && keepAvg !== null && keepNow < keepAvg ? "warn" : "good"
          }
          note="401(k) + cash kept, of gross pay"
        />
        <StatTile
          label="Burn pace"
          value={summary ? currency(summary.daily_avg) : "—"}
          delta={avgPerDay > 0 ? `vs ${currency(avgPerDay)} avg` : undefined}
          deltaTone={summary && summary.daily_avg > avgPerDay ? "bad" : "good"}
          note={
            summary
              ? `Per day · projects to ${currency(summary.projected)} by ${shortDate(summary.period_end)}`
              : undefined
          }
        />
        <StatTile
          label="Discretionary left"
          value={
            summary ? currency(summary.discretionary_left, { cents: true }) : "—"
          }
          valueTone={summary && summary.discretionary_left < 0 ? "bad" : "fg"}
          delta={
            summary && summary.discretionary_budget > 0
              ? `${share((summary.discretionary_left / summary.discretionary_budget) * 100, 0)} of ${currency(summary.discretionary_budget)}`
              : undefined
          }
          deltaTone={summary && summary.discretionary_left < 0 ? "bad" : "warn"}
          note={
            summary
              ? daysLeft <= 0
                ? "Paycheck lands today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} until the next paycheck`
              : undefined
          }
        />
      </StatRow>

      <Module>
        <NetWorthArea />
      </Module>

      <Module>
        <ModuleHead
          title="This paycheck at a glance"
          subtitle="The full diagram lives on Money Flow."
          right={
            <Link
              href="/flow"
              className="rounded-md border border-edge px-2.5 py-1 font-mono text-micro uppercase text-accent transition-colors hover:border-accent"
            >
              Open money flow →
            </Link>
          }
        />
        {flow ? (
          <BandRow bands={bands} total={flow.gross} />
        ) : (
          <p className="mt-4 text-caption text-muted">
            Add a paycheck to see how it was split.
          </p>
        )}
      </Module>

      <Split>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Where it went, vs your average"
            subtitle="Tick marks the six-period average for the same point in the period."
          />
          <DeviationRows rows={deviations} limit={8} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead title="Top merchants" subtitle="This period, by total spent." />
          <MerchantRows data={summary?.top_merchants ?? []} limit={7} />
        </div>
      </Split>

      <Split cols={3} className="border-t border-line">
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead title="Retirement pace" />
          <RetirementPace goals={goals} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead title="Recurring commitments" />
          <RecurringList data={recurring} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead title="Worth watching" />
          <WorthWatching insights={insights} />
        </div>
      </Split>
    </>
  );
}
