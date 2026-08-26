"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const [cadence, setCadence] = useState("biweekly");
  const [anchor, setAnchor] = useState("");
  const [incomeKeywords, setIncomeKeywords] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [limit, setLimit] = useState("7500");
  const [contributed, setContributed] = useState("0");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api<Record<string, string>>("/settings")
      .then((s) => {
        if (s.pay_cadence) setCadence(s.pay_cadence);
        if (s.pay_anchor) setAnchor(s.pay_anchor);
        if (s.income_keywords) setIncomeKeywords(s.income_keywords);
      })
      .catch(() => {});
    api<{ limit: number; contributed_ytd: number } | null>("/metrics/roth")
      .then((r) => {
        if (r) {
          setLimit(String(r.limit));
          setContributed(String(r.contributed_ytd));
        }
      })
      .catch(() => {});
  }, []);

  async function savePay(e: React.FormEvent) {
    e.preventDefault();
    await api("/settings", {
      method: "PUT",
      body: JSON.stringify({
        pay_cadence: cadence,
        pay_anchor: anchor || null,
        income_keywords: incomeKeywords,
      }),
    });
    setSaved("Saved. Re-sync or reclassify to apply to existing transactions.");
  }

  async function saveRoth(e: React.FormEvent) {
    e.preventDefault();
    await api("/settings/roth-goal", {
      method: "PUT",
      body: JSON.stringify({
        year,
        limit: parseFloat(limit || "0"),
        contributed_ytd: parseFloat(contributed || "0"),
      }),
    });
    setSaved("Roth goal saved.");
  }

  return (
    <Shell>
      <PageHeader title="Settings" />
      {saved && <p className="mb-4 text-sm text-good">{saved}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-medium">Pay schedule</h2>
          <form onSubmit={savePay} className="space-y-3">
            <label className="block text-xs text-muted">
              Cadence
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="semimonthly">Twice a month (1st & 16th)</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="block text-xs text-muted">
              A recent payday (anchor)
              <input
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <label className="block text-xs text-muted">
              Income keywords (comma-separated)
              <input
                value={incomeKeywords}
                onChange={(e) => setIncomeKeywords(e.target.value)}
                placeholder="e.g. persist, gusto"
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
              />
              <span className="mt-1 block text-[11px] text-muted">
                Deposits matching these (plus payroll/salary/interest) are counted as
                income, e.g. your Persist-AI paycheck.
              </span>
            </label>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Save
            </button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium">Roth IRA goal</h2>
          <form onSubmit={saveRoth} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-xs text-muted">
                Year
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value || "0"))}
                  className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="block text-xs text-muted">
                Limit
                <input
                  type="number"
                  step="0.01"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="block text-xs text-muted">
                Contributed
                <input
                  type="number"
                  step="0.01"
                  value={contributed}
                  onChange={(e) => setContributed(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-gray-100"
                />
              </label>
            </div>
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              Save
            </button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
