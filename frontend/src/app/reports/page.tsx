"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Eyebrow, Module, ModuleHead, PageHead, Pill } from "@/components/primitives";
import { Button, Chip } from "@/components/dash/controls";
import { api } from "@/lib/api";
import { currency, shortDate } from "@/lib/format";

interface Cutback {
  target: string;
  suggestion: string;
  monthly_impact: number;
}
interface ReportContent {
  headline?: string;
  spending?: string;
  comparison?: { direction?: string; note?: string };
  wins?: string[];
  cutbacks?: Cutback[];
  portfolio?: string;
  actions?: string[];
}
interface FullReport {
  id: number;
  period_start: string;
  period_end: string;
  generated_at: string;
  content: ReportContent;
}
interface ReportSummary {
  id: number;
  period_start: string;
  period_end: string;
  generated_at: string;
  headline: string;
}

const DIRECTION_TONE: Record<string, "good" | "bad" | "neutral"> = {
  improved: "good",
  worse: "bad",
  similar: "neutral",
};

export default function ReportsPage() {
  const [list, setList] = useState<ReportSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(() => {
    api<ReportSummary[]>("/reports")
      .then((rs) => {
        setList(rs);
        setSelected((cur) => cur ?? rs[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(loadList, [loadList]);

  useEffect(() => {
    if (selected == null) {
      setReport(null);
      return;
    }
    api<FullReport>(`/reports/${selected}`).then(setReport).catch(() => {});
  }, [selected]);

  async function generate() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<FullReport>("/reports/generate", { method: "POST" });
      await loadList();
      setSelected(r.id);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  async function emailReport() {
    if (!report) return;
    setEmailing(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/reports/${report.id}/email`, { method: "POST" });
      setNotice("Report emailed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the email.");
    } finally {
      setEmailing(false);
    }
  }

  const c = report?.content;

  return (
    <Shell bare>
      <PageHead
        title="Reports"
        subtitle="An AI read on each pay period — what you spent, how it compares, and what to do next."
        actions={
          <div className="flex gap-2">
            {report && (
              <Button onClick={emailReport} disabled={emailing}>
                {emailing ? "Sending…" : "Email"}
              </Button>
            )}
            <Button onClick={generate} disabled={generating} variant="primary">
              {generating ? "Analyzing…" : "Generate report"}
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="border-b border-line px-8 py-3">
          <p className="text-caption text-good">{notice}</p>
        </div>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-8 py-3">
          {list.map((r) => (
            <Pill key={r.id} active={selected === r.id} onClick={() => setSelected(r.id)}>
              {shortDate(r.period_start)}–{shortDate(r.period_end)}
            </Pill>
          ))}
        </div>
      )}

      {error && (
        <div className="border-b border-line px-8 py-3">
          <p className="text-caption text-bad">{error}</p>
        </div>
      )}

      {!report && !generating && list.length === 0 && (
        <Module>
          <p className="text-body text-muted">
            No reports yet. Click <span className="text-fg">Generate report</span> to
            analyze the current pay period. After that, a fresh report is written
            automatically each payday.
          </p>
        </Module>
      )}

      {c && (
        <>
          <Module>
            <Eyebrow>
              {report && `${shortDate(report.period_start)} – ${shortDate(report.period_end)}`}
              {c.comparison?.direction && (
                <span className="ml-2">
                  <Chip tone={DIRECTION_TONE[c.comparison.direction] ?? "neutral"}>
                    {c.comparison.direction}
                  </Chip>
                </span>
              )}
            </Eyebrow>
            <h2 className="mt-3 max-w-3xl text-section font-semibold leading-tight text-fg">
              {c.headline}
            </h2>
            {c.comparison?.note && (
              <p className="mt-3 max-w-3xl text-body text-muted">{c.comparison.note}</p>
            )}
          </Module>

          {c.spending && (
            <Module>
              <ModuleHead title="Spending" />
              <p className="mt-3 max-w-3xl text-body text-fg">{c.spending}</p>
            </Module>
          )}

          {c.cutbacks && c.cutbacks.length > 0 && (
            <Module>
              <ModuleHead
                title="Where to cut back"
                subtitle="Specific, dollar-weighted suggestions from this period's activity."
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {c.cutbacks.map((cb, i) => (
                  <div key={i} className="border border-line p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-h2 font-semibold text-fg">{cb.target}</span>
                      {cb.monthly_impact > 0 && (
                        <span className="shrink-0 font-mono text-micro tabular-nums text-good">
                          ~{currency(cb.monthly_impact)}/mo
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-caption text-muted">{cb.suggestion}</p>
                  </div>
                ))}
              </div>
            </Module>
          )}

          {c.wins && c.wins.length > 0 && (
            <Module>
              <ModuleHead title="Wins" />
              <ul className="mt-3 space-y-2">
                {c.wins.map((w, i) => (
                  <li key={i} className="flex gap-2 text-body text-fg">
                    <span className="text-good">✓</span>
                    <span className="max-w-3xl">{w}</span>
                  </li>
                ))}
              </ul>
            </Module>
          )}

          {c.portfolio && (
            <Module>
              <ModuleHead title="Portfolio" />
              <p className="mt-3 max-w-3xl text-body text-fg">{c.portfolio}</p>
            </Module>
          )}

          {c.actions && c.actions.length > 0 && (
            <Module>
              <ModuleHead title="Do this next" />
              <ol className="mt-3 space-y-2">
                {c.actions.map((a, i) => (
                  <li key={i} className="flex gap-3 text-body text-fg">
                    <span className="font-mono text-micro text-accent">{i + 1}</span>
                    <span className="max-w-3xl">{a}</span>
                  </li>
                ))}
              </ol>
            </Module>
          )}

          {report && (
            <div className="px-8 py-4">
              <span className="font-mono text-eyebrow uppercase text-dim">
                Generated {new Date(report.generated_at).toLocaleString()}
              </span>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
