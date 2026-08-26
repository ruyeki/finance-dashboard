"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { currency } from "@/lib/format";
import { Account, ACCOUNT_TYPE_LABELS, AccountType } from "@/lib/types";
import SimpleFinConnect from "@/components/SimpleFinConnect";

const TYPE_OPTIONS: AccountType[] = [
  "checking",
  "savings",
  "brokerage",
  "roth",
  "_401k",
  "credit",
  "other",
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    institution: "",
    type: "_401k" as AccountType,
    current_balance: "",
  });

  function load() {
    api<Account[]>("/accounts").then(setAccounts).catch(() => {});
  }
  useEffect(load, []);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    await api("/accounts/manual", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        institution: form.institution,
        type: form.type,
        current_balance: parseFloat(form.current_balance || "0"),
      }),
    });
    setForm({ name: "", institution: "", type: "_401k", current_balance: "" });
    setShowForm(false);
    load();
  }

  async function changeType(a: Account, type: string) {
    const updated = await api<Account>(`/accounts/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ type }),
    });
    setAccounts((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
  }

  async function updateBalance(a: Account) {
    const input = prompt(`New balance for ${a.name}:`, String(a.current_balance));
    if (input == null) return;
    const balance = parseFloat(input);
    if (Number.isNaN(balance)) return;
    await api(`/accounts/${a.id}/snapshot`, {
      method: "POST",
      body: JSON.stringify({
        account_id: a.id,
        date: new Date().toISOString().slice(0, 10),
        balance,
      }),
    });
    load();
  }

  async function remove(a: Account) {
    if (!confirm(`Delete ${a.name}? This removes its transactions too.`)) return;
    await api(`/accounts/${a.id}`, { method: "DELETE" });
    load();
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await api("/sync", { method: "POST" });
      load();
    } finally {
      setSyncing(false);
    }
  }

  async function resetAll() {
    if (
      !confirm(
        "Reset ALL financial data (accounts, transactions, connections, paychecks)? " +
          "Settings and your Roth goal are kept. This cannot be undone.",
      )
    )
      return;
    await api("/admin/reset", { method: "POST" });
    load();
  }

  // Liabilities (credit/loans) are stored negative, so a plain sum is net worth.
  const total = accounts.reduce((sum, a) => sum + a.current_balance, 0);

  return (
    <Shell>
      <PageHeader
        title="Accounts"
        subtitle={`${accounts.length} accounts · ${currency(total)} net`}
        actions={
          <div className="flex items-start gap-2">
            <button
              onClick={syncNow}
              disabled={syncing}
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={() => setShowConnect((v) => !v)}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              Connect bank
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Add manual
            </button>
            <button
              onClick={resetAll}
              className="rounded-lg border border-line px-3 py-2 text-sm text-bad"
            >
              Reset
            </button>
          </div>
        }
      />

      {showConnect && <SimpleFinConnect onConnected={load} />}

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={addAccount} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              required
              placeholder="Account name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              placeholder="Institution"
              value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Balance"
                value={form.current_balance}
                onChange={(e) => setForm({ ...form, current_balance: e.target.value })}
                className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button className="rounded-lg bg-good px-4 py-2 text-sm font-medium text-black">
                Save
              </button>
            </div>
          </form>
          <p className="mt-2 text-xs text-muted">
            Use this for your Guideline 401(k) or anything the aggregator can&apos;t connect.
          </p>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 text-right font-medium">Balance</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-line/60">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted">{a.institution}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={a.type}
                      onChange={(e) => changeType(a, e.target.value)}
                      className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs outline-none focus:border-accent"
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {ACCOUNT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        a.is_manual
                          ? "bg-warn/15 text-warn"
                          : "bg-accent/15 text-accent"
                      }`}
                    >
                      {a.is_manual ? "Manual" : "Linked"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {currency(a.current_balance, { cents: true })}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      {a.is_manual && (
                        <button
                          onClick={() => updateBalance(a)}
                          className="text-accent hover:underline"
                        >
                          Update
                        </button>
                      )}
                      <button
                        onClick={() => remove(a)}
                        className="text-bad hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No accounts yet. Connect a bank or add one manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
