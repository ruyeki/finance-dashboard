"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Table,
} from "@/components/dash/controls";
import { api, apiBase, ApiError } from "@/lib/api";
import { currency, share, shortDate } from "@/lib/format";
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

const FIELDS = [
  ["gross", "Gross"],
  ["federal_tax", "Federal tax"],
  ["state_tax", "State tax"],
  ["social_security", "Social Security"],
  ["medicare", "Medicare"],
  ["insurance", "Insurance"],
  ["retirement_401k", "401(k)"],
  ["net", "Net"],
] as const;

const COLS = "96px 1fr 120px 120px 110px 110px 130px 110px 70px";

export default function PaychecksPage() {
  const [paychecks, setPaychecks] = useState<Paycheck[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"muted" | "good" | "bad">("muted");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api<Paycheck[]>("/paychecks").then(setPaychecks).catch(() => {});
  }
  useEffect(load, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Parsing paystub…");
    setMsgTone("muted");
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`${apiBase()}/paychecks/upload`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new ApiError(res.status, j.detail ?? "Upload failed");
      }
      setMsg("Parsed. Check the values below before relying on them.");
      setMsgTone("good");
      load();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Upload failed");
      setMsgTone("bad");
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

  const totals = useMemo(() => {
    const gross = paychecks.reduce((s, p) => s + p.gross, 0);
    const withheld = paychecks.reduce((s, p) => s + taxes(p) + p.insurance, 0);
    const k401 = paychecks.reduce((s, p) => s + p.retirement_401k, 0);
    const net = paychecks.reduce((s, p) => s + p.net, 0);
    return { gross, withheld, k401, net };
  }, [paychecks]);

  return (
    <Shell bare>
      <PageHead
        title="Paychecks"
        subtitle="Gross pay is the denominator for every share on the dashboard, so these drive the flow diagram."
        actions={
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => fileRef.current?.click()}>
              Upload paystub PDF
            </Button>
            <Button onClick={() => setShowManual((v) => !v)}>
              {showManual ? "Cancel" : "Add manually"}
            </Button>
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

      <StatRow>
        <StatTile
          label="Paychecks"
          value={String(paychecks.length)}
          note="On record"
        />
        <StatTile label="Gross" value={currency(totals.gross)} note="Before anything comes out" />
        <StatTile
          label="Withheld"
          value={currency(totals.withheld)}
          valueTone={totals.withheld > 0 ? "bad" : "fg"}
          delta={
            totals.gross > 0
              ? share((totals.withheld / totals.gross) * 100)
              : undefined
          }
          deltaTone="bad"
          note="Tax plus insurance"
        />
        <StatTile
          label="Take-home"
          value={currency(totals.net)}
          valueTone="good"
          delta={
            totals.gross > 0 ? share((totals.net / totals.gross) * 100) : undefined
          }
          deltaTone="good"
          note={`${currency(totals.k401)} into the 401(k) on top`}
        />
      </StatRow>

      {msg && (
        <div className="border-b border-line px-8 py-3">
          <p
            className={`text-caption ${
              msgTone === "good"
                ? "text-good"
                : msgTone === "bad"
                  ? "text-bad"
                  : "text-muted"
            }`}
          >
            {msg}
          </p>
        </div>
      )}

      {showManual && (
        <Module>
          <ModuleHead
            title="Add a paycheck"
            subtitle="Net is stored as given rather than derived, so a stub that does not reconcile still records faithfully."
          />
          <form onSubmit={addManual} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Pay date">
              <Input
                type="date"
                value={form.pay_date}
                onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
              />
            </Field>
            {FIELDS.map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Employer">
              <Input
                value={form.employer}
                onChange={(e) => setForm({ ...form, employer: e.target.value })}
              />
            </Field>
            <div className="col-span-2 flex items-end sm:col-span-4">
              <Button type="submit" variant="primary">
                Save paycheck
              </Button>
            </div>
          </form>
        </Module>
      )}

      <Module>
        <ModuleHead title="All paychecks" />
        <Table
          cols={COLS}
          minWidth={980}
          head={[
            "Pay date",
            "Employer",
            <span key="g" className="block text-right">Gross</span>,
            <span key="t" className="block text-right">Taxes</span>,
            <span key="i" className="block text-right">Insurance</span>,
            <span key="k" className="block text-right">401(k)</span>,
            <span key="n" className="block text-right">Net</span>,
            "Source",
            "",
          ]}
        >
          {paychecks.map((p) => (
            <Row key={p.id} cols={COLS}>
              <span className="font-mono text-caption text-muted">
                {shortDate(p.pay_date)}
              </span>
              <span className="min-w-0 truncate text-body text-fg">
                {p.employer ?? "—"}
              </span>
              <span className="text-right font-mono text-body tabular-nums text-fg">
                {currency(p.gross, { cents: true })}
              </span>
              <span className="text-right font-mono text-body tabular-nums text-bad">
                −{currency(taxes(p), { cents: true })}
              </span>
              <span className="text-right font-mono text-body tabular-nums text-bad">
                −{currency(p.insurance, { cents: true })}
              </span>
              <span className="text-right font-mono text-body tabular-nums text-good">
                {currency(p.retirement_401k, { cents: true })}
              </span>
              <span className="text-right font-mono text-body font-medium tabular-nums text-fg">
                {currency(p.net, { cents: true })}
              </span>
              <span>
                <Chip tone={p.parsed_by === "ai" ? "accent" : "neutral"}>
                  {p.parsed_by === "ai" ? "AI-parsed" : "Manual"}
                </Chip>
              </span>
              <span className="flex justify-end">
                <RowAction tone="bad" onClick={() => remove(p.id)}>
                  Delete
                </RowAction>
              </span>
            </Row>
          ))}
          {paychecks.length === 0 && (
            <EmptyRow>
              No paychecks yet. Without one, the flow diagram and savings rate have
              no denominator.
            </EmptyRow>
          )}
        </Table>
      </Module>
    </Shell>
  );
}
