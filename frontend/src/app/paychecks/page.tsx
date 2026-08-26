"use client";

import { useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import { api, API_URL, ApiError } from "@/lib/api";
import { currency, shortDate } from "@/lib/format";
import { Paycheck } from "@/lib/types";

const EMPTY = {
  pay_date: new Date().toISOString().slice(0, 10),
  gross: "",
  federal_tax: "",
  state_tax: "",
  social_security: "",
  medicare: "",
  insurance: "",
  retirement_401k: "",
  net: "",
  employer: "",
};

export default function PaychecksPage() {
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Paycheck[]>("/paychecks").then(setPaychecks).catch(() => {});
  }
  useEffect(load, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Parsing paystub…");
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`${API_URL}/paychecks/upload`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new ApiError(res.status, j.detail ?? "Upload failed");
      }
      setMsg("Parsed! Review the values below.");
      load();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const num = (v: string) => parseFloat(v || "0") || 0;
    await api("/paychecks/manual", {
      method: "POST",
      body: JSON.stringify({
        pay_date: form.pay_date,
        gross: num(form.gross),
        federal_tax: num(form.federal_tax),
        state_tax: num(form.state_tax),
        social_security: num(form.social_security),
        medicare: num(form.medicare),
        insurance: num(form.insurance),
        retirement_401k: num(form.retirement_401k),
        net: num(form.net),
        employer: form.employer || null,
      }),
    });
    setForm({ ...EMPTY });
    setShowManual(false);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this paycheck?")) return;
    await api(`/paychecks/${id}`, { method: "DELETE" });
    load();
  }

  const taxes = (p: Paycheck) =>
    p.federal_tax + p.state_tax + p.social_security + p.medicare;

  return (
    <Shell>
      <PageHeader
        title="Paychecks"
        subtitle="Upload a Gusto paystub PDF, or add one manually"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              Upload paystub PDF
            </button>
            <button
              onClick={() => setShowManual((v) => !v)}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              {showManual ? "Cancel" : "Add manually"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={upload}
              className="hidden"
            />
          </div>
        }
      />

      {msg && <p className="mb-4 text-sm text-muted">{msg}</p>}

      {showManual && (
        <Card className="mb-4">
          <form onSubmit={addManual} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-muted">
              Pay date
              <input
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-gray-100"
              />
            </label>
            {(
              [
                ["gross", "Gross"],
                ["federal_tax", "Federal tax"],
                ["state_tax", "State tax"],
                ["social_security", "Social Security"],
                ["medicare", "Medicare"],
                ["insurance", "Insurance"],
                ["retirement_401k", "401(k)"],
                ["net", "Net"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs text-muted">
                {label}
                <input
                  type="number"
                  step="0.01"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-gray-100"
                />
              </label>
            ))}
            <label className="text-xs text-muted">
              Employer
              <input
                value={form.employer}
                onChange={(e) => setForm({ ...form, employer: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm text-gray-100"
              />
            </label>
            <div className="col-span-2 flex items-end sm:col-span-4">
              <button className="rounded-lg bg-good px-4 py-2 text-sm font-medium text-black">
                Save paycheck
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted">
                <th className="py-2 pr-4 font-medium">Pay date</th>
                <th className="py-2 pr-4 font-medium">Employer</th>
                <th className="py-2 pr-4 text-right font-medium">Gross</th>
                <th className="py-2 pr-4 text-right font-medium">Taxes</th>
                <th className="py-2 pr-4 text-right font-medium">Insurance</th>
                <th className="py-2 pr-4 text-right font-medium">401(k)</th>
                <th className="py-2 pr-4 text-right font-medium">Net</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {paychecks.map((p) => (
                <tr key={p.id} className="border-t border-line/60">
                  <td className="py-2 pr-4">{shortDate(p.pay_date)}</td>
                  <td className="py-2 pr-4 text-muted">{p.employer ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{currency(p.gross, { cents: true })}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-bad">−{currency(taxes(p), { cents: true })}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-bad">−{currency(p.insurance, { cents: true })}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-accent">{currency(p.retirement_401k, { cents: true })}</td>
                  <td className="py-2 pr-4 text-right font-medium tabular-nums text-good">{currency(p.net, { cents: true })}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">
                      {p.parsed_by === "ai" ? "AI-parsed" : "Manual"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <button onClick={() => remove(p.id)} className="text-xs text-bad hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {paychecks.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted">
                    No paychecks yet.
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
