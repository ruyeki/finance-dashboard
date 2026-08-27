"use client";

import { useEffect, useMemo, useState } from "react";
import Shell, { useSummary } from "@/components/Shell";
import {
  BasisPills,
  Module,
  ModuleHead,
  PageHead,
  StatRow,
  StatTile,
} from "@/components/primitives";
import { DeviationRows, MerchantRows } from "@/components/dash/rows";
import { PaceChart } from "@/components/dash/charts";
import { TransactionsTable } from "@/components/dash/TransactionsTable";
import { api } from "@/lib/api";
import {
  currency,
  periodLabel,
  share,
  signedCurrency,
} from "@/lib/format";
import type { SpendingSummary, Transaction } from "@/lib/types";

export default function SpendingPage() {
  return (
    <Shell bare>
      <SpendingContent />
    </Shell>
  );
}

function SpendingContent() {
  const shellSummary = useSummary();
  // Recategorising changes every tier-cut figure on this screen, so a refreshed
  // summary can override the shell's copy. It stays null until that happens,
  // rather than mirroring the shell into state on mount.
  const [override, setOverride] = useState<SpendingSummary | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);

  const active = override ?? shellSummary;

  useEffect(() => {
    if (!shellSummary) return;
    let live = true;
    api<Transaction[]>(
      `/transactions?start=${shellSummary.period_start}&end=${shellSummary.period_end}&limit=300`,
    )
      .then((t) => live && setTxns(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [shellSummary]);

  async function recategorize(id: number, category: string) {
    try {
      const updated = await api<Transaction>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ category }),
      });
      setTxns((prev) => prev.map((t) => (t.id === id ? updated : t)));
      // The tier cuts every figure on this screen, so the summary has to follow.
      const fresh = await api<SpendingSummary>("/metrics/spending");
      setOverride(fresh);
    } catch {
      /* leave the row as it was; the select still shows the server value */
    }
  }

  const deviations = useMemo(() => {
    if (!active) return [];
    const avgs = active.category_averages ?? {};
    return active.by_category.map((c) => ({
      label: c.category,
      value: c.amount,
      average: avgs[c.category] ?? 0,
    }));
  }, [active]);

  const biggest = useMemo(() => {
    if (!deviations.length) return null;
    return [...deviations].sort(
      (a, b) => Math.abs(b.value - b.average) - Math.abs(a.value - a.average),
    )[0];
  }, [deviations]);

  const vsAvg = active ? active.total - active.average : 0;
  const projectedVsAvg =
    active && active.average > 0
      ? ((active.projected - active.average) / active.average) * 100
      : 0;

  return (
    <>
      <PageHead
        title="Spending"
        subtitle={
          active
            ? `${periodLabel(active)} · transfers and income excluded from totals`
            : "Loading…"
        }
        actions={<BasisPills />}
      />

      <StatRow>
        <StatTile
          label="Spent this period"
          value={active ? currency(active.total) : "—"}
          delta={active ? `${signedCurrency(vsAvg)} vs avg` : undefined}
          deltaTone={vsAvg > 0 ? "bad" : "good"}
          note={
            active
              ? `Day ${active.days_elapsed} of ${active.days_total} · ${currency(active.daily_avg)}/day`
              : undefined
          }
        />
        <StatTile
          label="Projected finish"
          value={active ? currency(active.projected) : "—"}
          delta={
            active && active.average > 0
              ? `${projectedVsAvg >= 0 ? "+" : "−"}${Math.abs(projectedVsAvg).toFixed(0)}% vs avg`
              : undefined
          }
          deltaTone={projectedVsAvg > 0 ? "bad" : "good"}
          note="At the current daily rate"
        />
        <StatTile
          label="Discretionary left"
          value={active ? currency(active.discretionary_left, { cents: true }) : "—"}
          valueTone={active && active.discretionary_left < 0 ? "bad" : "fg"}
          delta={
            active && active.discretionary_budget > 0
              ? `${share((active.discretionary_left / active.discretionary_budget) * 100, 0)} of ${currency(active.discretionary_budget)}`
              : undefined
          }
          deltaTone={active && active.discretionary_left < 0 ? "bad" : "warn"}
          note="Fixed and essentials are already paid"
        />
        <StatTile
          label="Biggest move"
          value={biggest ? biggest.label : "—"}
          delta={biggest ? signedCurrency(biggest.value - biggest.average) : undefined}
          deltaTone={biggest && biggest.value > biggest.average ? "bad" : "good"}
          note={
            biggest
              ? biggest.average === 0
                ? "Nothing here in the previous six periods"
                : `Against a ${currency(biggest.average, { cents: true })} average`
              : undefined
          }
        />
      </StatRow>

      <div
        className="grid divide-x divide-line border-b border-line"
        style={{ gridTemplateColumns: "1.15fr 1fr" }}
      >
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Every category against its average"
            subtitle="Bar is this period. Tick is the six-period average. Sorted by how far off you are."
          />
          <DeviationRows rows={deviations} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Pace"
            subtitle="Cumulative spend against the same day of your average period."
          />
          {active ? (
            <PaceChart summary={active} transactions={txns} />
          ) : (
            <p className="mt-4 text-caption text-muted">Loading…</p>
          )}
        </div>
      </div>

      <Module>
        <ModuleHead
          title="Transactions this period"
          subtitle="Transfers and income are listed but excluded from spending totals. Changing a category becomes a reusable rule."
        />
        <TransactionsTable rows={txns} onRecategorize={recategorize} />
      </Module>

      <Module>
        <ModuleHead title="Top merchants" subtitle="This period, by total spent." />
        <MerchantRows data={active?.top_merchants ?? []} limit={8} columns={2} />
      </Module>
    </>
  );
}
