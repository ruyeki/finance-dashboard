"use client";

import { useEffect, useMemo, useState } from "react";
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
import { FlowClaim, FlowDiagram } from "@/components/dash/FlowDiagram";
import { BandRow, type Band } from "@/components/dash/BandRow";
import { KeepRateBars } from "@/components/dash/bars";
import { buildInsights, WorthWatching } from "@/components/dash/notes";
import { api } from "@/lib/api";
import { currency, periodLabel, share, signedCurrency, signedPoints } from "@/lib/format";
import type {
  ContributionGoal,
  FlowData,
  KeepRatePoint,
} from "@/lib/types";

export default function FlowPage() {
  return (
    <Shell bare>
      <FlowContent />
    </Shell>
  );
}

function FlowContent() {
  const summary = useSummary();
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [keep, setKeep] = useState<KeepRatePoint[]>([]);
  const [goals, setGoals] = useState<ContributionGoal[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const soft = () => {};
    api<FlowData>("/metrics/flow")
      .then(setFlow)
      .catch(() => setFailed(true));
    api<KeepRatePoint[]>("/metrics/keep-rate?n=12").then(setKeep).catch(soft);
    api<ContributionGoal[]>("/metrics/goals").then(setGoals).catch(soft);
  }, []);

  const parts = useMemo(() => {
    if (!flow) return null;
    const takehome = flow.split1.find((n) => n.key === "takehome")?.value ?? 0;
    const by = Object.fromEntries(flow.split2.map((n) => [n.key, n]));
    const committed = (by.fixed?.value ?? 0) + (by.essential?.value ?? 0);
    const chosen = by.discretionary;
    return {
      takehome,
      committed,
      chosen,
      chosenDelta:
        chosen && chosen.avg !== undefined ? chosen.value - chosen.avg : null,
    };
  }, [flow]);

  const discretionaryBands: Band[] = useMemo(() => {
    const kids = flow?.split2.find((n) => n.key === "discretionary")?.children ?? [];
    return kids.map((c) => ({
      key: c.name,
      label: c.name,
      value: c.value,
      tone: "bad" as const,
      // The handoff asks for a comparison here, not a share: the share is
      // already the block's width.
      detail:
        c.avg > 0
          ? Math.abs(c.value - c.avg) < 0.5
            ? "on avg"
            : `${signedCurrency(c.value - c.avg)} vs avg`
          : "new this period",
    }));
  }, [flow]);

  const discretionaryTotal =
    flow?.split2.find((n) => n.key === "discretionary")?.value ?? 0;

  const keepNow = summary?.keep_rate ?? null;
  const keepAvg = keep.length ? keep[keep.length - 1].average : null;
  const insights = useMemo(() => buildInsights(summary, goals), [summary, goals]);

  const hasFlow = flow !== null && flow.gross > 0;

  return (
    <>
      <PageHead
        title="Money Flow"
        subtitle={
          summary
            ? `${periodLabel(summary)}${flow ? ` · ${currency(flow.gross, { cents: true })} gross` : ""}`
            : "Loading…"
        }
        actions={<BasisPills />}
      />

      <StatRow>
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
          label="Take-home"
          value={
            parts && flow && flow.gross > 0
              ? share((parts.takehome / flow.gross) * 100)
              : "—"
          }
          delta="of gross"
          note={
            parts
              ? `${currency(parts.takehome, { cents: true })} after tax, insurance, 401(k)`
              : undefined
          }
        />
        <StatTile
          label="Committed"
          value={
            parts && parts.takehome > 0
              ? share((parts.committed / parts.takehome) * 100)
              : "—"
          }
          delta="of take-home"
          note="Fixed bills plus essentials — hard to move"
        />
        <StatTile
          label="Chosen"
          value={
            parts?.chosen && parts.takehome > 0
              ? share((parts.chosen.value / parts.takehome) * 100)
              : "—"
          }
          valueTone={
            parts?.chosenDelta !== null && (parts?.chosenDelta ?? 0) > 0 ? "bad" : "fg"
          }
          delta={
            parts?.chosenDelta != null
              ? `${signedCurrency(parts.chosenDelta)} vs avg`
              : undefined
          }
          deltaTone={(parts?.chosenDelta ?? 0) > 0 ? "bad" : "good"}
          note="Discretionary — the branch that moves"
        />
      </StatRow>

      <Module>
        <ModuleHead
          title="Gross pay to what you kept"
          subtitle="Ribbon thickness is dollars. Hover a destination to isolate its path."
          right={flow ? <FlowClaim data={flow} /> : undefined}
        />
        {hasFlow ? (
          <div className="mt-5">
            <FlowDiagram data={flow} />
          </div>
        ) : (
          <p className="mt-4 text-caption text-muted">
            {failed
              ? "Could not load the money flow."
              : "Add a paycheck and some transactions to see your money flow."}
          </p>
        )}
      </Module>

      {discretionaryBands.length > 0 && (
        <Module>
          <ModuleHead
            title="Inside discretionary"
            subtitle="Re-normalised to 100% of the discretionary branch, so the small pieces stay legible."
            right={
              <span className="font-mono text-eyebrow uppercase text-dim">
                {currency(discretionaryTotal, { cents: true })} — the branch that
                moved
              </span>
            }
          />
          <BandRow
            bands={discretionaryBands}
            total={discretionaryTotal}
            height={62}
          />
        </Module>
      )}

      <Split>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Keep rate"
            subtitle="Share of gross that stays yours — 401(k) plus cash left over."
          />
          <KeepRateBars data={keep} />
        </div>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead title="Worth watching" />
          <WorthWatching insights={insights} />
        </div>
      </Split>
    </>
  );
}
