"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ModuleHead, PageHead, Split } from "@/components/primitives";
import { Button, Field, Input, Select } from "@/components/dash/controls";
import { api } from "@/lib/api";
import { currency } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType, type ContributionGoal } from "@/lib/types";

const GOAL_TYPES: AccountType[] = ["roth", "_401k", "brokerage"];

export default function SettingsPage() {
  const [cadence, setCadence] = useState("biweekly");
  const [anchor, setAnchor] = useState("");
  const [incomeKeywords, setIncomeKeywords] = useState("");
  const [budget, setBudget] = useState("600");

  const [goalType, setGoalType] = useState<AccountType>("roth");
  const [year, setYear] = useState(new Date().getFullYear());
  const [limit, setLimit] = useState("7500");
  const [contributed, setContributed] = useState("0");
  const [goals, setGoals] = useState<ContributionGoal[]>([]);

  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Pull an existing goal's figures into the form, so saving cannot
   *  overwrite one goal with another's numbers. */
  function applyGoal(type: AccountType, yr: number, list: ContributionGoal[]) {
    const match = list.find((g) => g.account_type === type && g.year === yr);
    if (match) {
      setLimit(String(match.limit));
      setContributed(String(match.contributed_ytd));
    }
  }

  function loadGoals() {
    api<ContributionGoal[]>("/metrics/goals")
      .then((list) => {
        setGoals(list);
        applyGoal(goalType, year, list);
      })
      .catch(() => {});
  }

  useEffect(() => {
    api<Record<string, string>>("/settings")
      .then((s) => {
        if (s.pay_cadence) setCadence(s.pay_cadence);
        if (s.pay_anchor) setAnchor(s.pay_anchor);
        if (s.income_keywords) setIncomeKeywords(s.income_keywords);
        if (s.discretionary_budget) setBudget(s.discretionary_budget);
      })
      .catch(() => {});
    // Inlined rather than calling loadGoals(): on mount the selection is still
    // the initial roth/current-year, so nothing needs to close over state that
    // changes later.
    api<ContributionGoal[]>("/metrics/goals")
      .then((list) => {
        setGoals(list);
        const match = list.find(
          (g) => g.account_type === "roth" && g.year === new Date().getFullYear(),
        );
        if (match) {
          setLimit(String(match.limit));
          setContributed(String(match.contributed_ytd));
        }
      })
      .catch(() => {});
  }, []);

  async function savePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          pay_cadence: cadence,
          pay_anchor: anchor || null,
          income_keywords: incomeKeywords,
          discretionary_budget: parseFloat(budget || "0"),
        }),
      });
      setSaved("Saved. Re-sync or reclassify to apply this to existing transactions.");
    } catch {
      setError("Could not save settings.");
    }
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/settings/goal", {
        method: "PUT",
        body: JSON.stringify({
          account_type: goalType,
          year,
          limit: parseFloat(limit || "0"),
          contributed_ytd: parseFloat(contributed || "0"),
        }),
      });
      setSaved(`${ACCOUNT_TYPE_LABELS[goalType]} goal saved.`);
      loadGoals();
    } catch {
      setError("Could not save the goal.");
    }
  }

  return (
    <Shell bare>
      <PageHead
        title="Settings"
        subtitle="Pay cadence defines every period boundary on the dashboard, so start there."
      />

      {(saved || error) && (
        <div className="border-b border-line px-8 py-3">
          <p className={`text-caption ${error ? "text-bad" : "text-good"}`}>
            {error ?? saved}
          </p>
        </div>
      )}

      <Split>
        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Pay schedule and budget"
            subtitle="The anchor is any real payday; every period is counted from it."
          />
          <form onSubmit={savePay} className="mt-4 space-y-4">
            <Field label="Cadence">
              <Select value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="semimonthly">Twice a month (1st &amp; 16th)</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Field>

            <Field label="A recent payday (anchor)">
              <Input
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </Field>

            <Field
              label="Income keywords"
              hint="Comma-separated. Deposits matching these — plus payroll, salary and interest — count as income rather than spending."
            >
              <Input
                value={incomeKeywords}
                onChange={(e) => setIncomeKeywords(e.target.value)}
                placeholder="e.g. persist, gusto"
              />
            </Field>

            <Field
              label="Discretionary budget per period"
              hint={`Drives "discretionary left" on Overview and Spending. Currently ${currency(parseFloat(budget || "0"))} per pay period.`}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>

            <Button type="submit" variant="primary">
              Save
            </Button>
          </form>
        </div>

        <div className="px-8 pb-[30px] pt-[26px]">
          <ModuleHead
            title="Contribution goals"
            subtitle="Shown as a pace bar on Overview, marked against the share of the year elapsed."
          />
          <form onSubmit={saveGoal} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Account">
                <Select
                  value={goalType}
                  onChange={(e) => {
                    const t = e.target.value as AccountType;
                    setGoalType(t);
                    applyGoal(t, year, goals);
                  }}
                >
                  {GOAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Year">
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => {
                    const y = parseInt(e.target.value || "0");
                    setYear(y);
                    applyGoal(goalType, y, goals);
                  }}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Limit">
                <Input
                  type="number"
                  step="0.01"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </Field>
              <Field label="Contributed so far">
                <Input
                  type="number"
                  step="0.01"
                  value={contributed}
                  onChange={(e) => setContributed(e.target.value)}
                />
              </Field>
            </div>

            <Button type="submit" variant="primary">
              Save goal
            </Button>
          </form>

          {goals.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <div className="font-mono text-eyebrow uppercase text-muted">
                Existing goals
              </div>
              <div className="mt-3 space-y-2">
                {goals.map((g) => (
                  <div
                    key={`${g.account_type}-${g.year}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-body text-fg">
                      {ACCOUNT_TYPE_LABELS[g.account_type as AccountType] ??
                        g.account_type}{" "}
                      {g.year}
                    </span>
                    <span className="font-mono text-micro tabular-nums text-muted">
                      {currency(g.contributed_ytd)} of {currency(g.limit)}
                    </span>
                    <span
                      className={`font-mono text-micro ${g.behind > 0 ? "text-warn" : "text-good"}`}
                    >
                      {g.behind > 0 ? `${currency(g.behind)} behind` : "On pace"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Split>
    </Shell>
  );
}
