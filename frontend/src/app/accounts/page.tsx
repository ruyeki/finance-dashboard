"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import {
  Module,
  ModuleHead,
  PageHead,
  StatRow,
  StatTile,
} from "@/components/primitives";
import {
  Button,
  Chip,
  EmptyRow,
  Field,
  Input,
  Row,
  RowAction,
  Select,
  Table,
} from "@/components/dash/controls";
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

const COLS = "1fr 160px 110px 150px 130px";

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

  const totals = useMemo(() => {
    // Liabilities are stored negative, so a plain sum is net worth.
    const net = accounts.reduce((s, a) => s + a.current_balance, 0);
    const assets = accounts
      .filter((a) => a.current_balance > 0)
      .reduce((s, a) => s + a.current_balance, 0);
    return {
      net,
      assets,
      liabilities: net - assets,
      linked: accounts.filter((a) => !a.is_manual).length,
      manual: accounts.filter((a) => a.is_manual).length,
    };
  }, [accounts]);

  return (
    <Shell bare>
      <PageHead
        title="Accounts"
        subtitle={`${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${totals.linked} linked, ${totals.manual} manual`}
        actions={
          <div className="flex items-start gap-2">
            <Button onClick={syncNow} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="primary" onClick={() => setShowConnect((v) => !v)}>
              Connect bank
            </Button>
            <Button onClick={() => setShowForm((v) => !v)}>Add manual</Button>
            <Button variant="danger" onClick={resetAll}>
              Reset
            </Button>
          </div>
        }
      />

      <StatRow>
        <StatTile
          label="Net worth"
          value={currency(totals.net)}
          note="Assets minus liabilities"
        />
        <StatTile label="Assets" value={currency(totals.assets)} valueTone="good" />
        <StatTile
          label="Liabilities"
          value={currency(totals.liabilities)}
          valueTone={totals.liabilities < 0 ? "bad" : "fg"}
          note="Credit cards and loans"
        />
        <StatTile
          label="Linked"
          value={String(totals.linked)}
          delta={totals.manual ? `${totals.manual} manual` : undefined}
          note="Manual accounts do not sync on their own"
        />
      </StatRow>

      {showConnect && (
        <Module>
          <SimpleFinConnect onConnected={load} />
        </Module>
      )}

      {showForm && (
        <Module>
          <ModuleHead
            title="Add a manual account"
            subtitle="For a Guideline 401(k) or anything the aggregator cannot connect."
          />
          <form onSubmit={addAccount} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Account name">
              <Input
                required
                placeholder="Guideline 401(k)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Institution">
              <Input
                placeholder="Guideline"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as AccountType })
                }
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Balance">
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.current_balance}
                  onChange={(e) =>
                    setForm({ ...form, current_balance: e.target.value })
                  }
                />
                <Button type="submit" variant="primary">
                  Save
                </Button>
              </div>
            </Field>
          </form>
        </Module>
      )}

      <Module>
        <ModuleHead
          title="All accounts"
          subtitle="Type drives how an account is counted — spending, investing, or debt."
        />
        <Table
          cols={COLS}
          head={[
            "Account",
            "Type",
            "Source",
            <span key="b" className="block text-right">
              Balance
            </span>,
            "",
          ]}
        >
          {accounts.map((a) => (
            <Row key={a.id} cols={COLS}>
              <span className="min-w-0">
                <span className="block truncate text-body font-medium text-fg">
                  {a.name}
                </span>
                <span className="block truncate text-caption text-muted">
                  {a.institution}
                </span>
              </span>

              <Select
                value={a.type}
                onChange={(e) => changeType(a, e.target.value)}
                aria-label={`Type for ${a.name}`}
                className="py-1"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>

              <span>
                <Chip tone={a.is_manual ? "warn" : "accent"}>
                  {a.is_manual ? "Manual" : "Linked"}
                </Chip>
              </span>

              <span
                className={`text-right font-mono text-body tabular-nums ${
                  a.current_balance < 0 ? "text-bad" : "text-fg"
                }`}
              >
                {currency(a.current_balance, { cents: true })}
              </span>

              <span className="flex justify-end gap-3">
                {a.is_manual && (
                  <RowAction onClick={() => updateBalance(a)}>Update</RowAction>
                )}
                <RowAction tone="bad" onClick={() => remove(a)}>
                  Delete
                </RowAction>
              </span>
            </Row>
          ))}
          {accounts.length === 0 && (
            <EmptyRow>
              No accounts yet. Connect a bank or add one manually.
            </EmptyRow>
          )}
        </Table>
      </Module>
    </Shell>
  );
}
