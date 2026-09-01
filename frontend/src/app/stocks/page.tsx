"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Shell from "@/components/Shell";
import {
  Eyebrow,
  Module,
  ModuleHead,
  PageHead,
  Pill,
  StatRow,
  StatTile,
} from "@/components/primitives";
import { Button, Chip, Row, Table } from "@/components/dash/controls";
import { api } from "@/lib/api";
import { currency, shortDate, share, signedPoints } from "@/lib/format";

interface Holding {
  ticker: string | null;
  name: string;
  shares: number;
  price: number | null;
  value: number;
  pct: number;
  target_pct: number | null;
}
interface Contribution {
  ticker: string | null;
  name: string;
  dollars: number;
  pct: number;
}
interface StockAccount {
  id: number;
  name: string;
  type: string;
  type_label: string;
  value: number;
  holdings: Holding[];
  contribution_per_period: number;
  contributions: Contribution[];
}
interface StocksData {
  accounts: StockAccount[];
  total: number;
}
interface HistoryPoint {
  date: string;
  portfolio: number;
  sp500: number;
}
interface History {
  series: HistoryPoint[];
  portfolio_return: number | null;
  sp500_return: number | null;
}

const HOLDING_COLS = "72px 1fr 96px 96px 110px 64px";
const ACCOUNTS = [
  { key: "all", label: "All" },
  { key: "_401k", label: "401(k)" },
  { key: "roth", label: "Roth" },
  { key: "brokerage", label: "Brokerage" },
];
const RANGES = ["1mo", "3mo", "6mo", "1y"];
const RANGE_LABEL: Record<string, string> = {
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};
const AXIS = { fill: "#8b93a7", fontSize: 11 } as const;

export default function StocksPage() {
  const [data, setData] = useState<StocksData | null>(null);
  const [hist, setHist] = useState<History | null>(null);
  const [acct, setAcct] = useState("all");
  const [range, setRange] = useState("3mo");
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadOverview = useCallback(() => {
    api<StocksData>("/stocks").then(setData).catch(() => {});
  }, []);

  const loadHistory = useCallback(() => {
    // No setHist(null) here: this runs as an effect body, and a synchronous
    // setState there cascades renders. The previous chart stays up until the
    // new one lands, which also avoids a blank flash when switching range.
    api<History>(`/stocks/history?account=${acct}&range=${range}`)
      .then(setHist)
      .catch(() => {});
  }, [acct, range]);

  useEffect(loadOverview, [loadOverview]);
  useEffect(loadHistory, [loadHistory]);

  async function refresh() {
    setRefreshing(true);
    try {
      await api("/stocks/refresh", { method: "POST" });
      loadOverview();
      loadHistory();
    } finally {
      setRefreshing(false);
    }
  }

  async function seed401k() {
    setSeeding(true);
    try {
      await api("/stocks/seed-401k", { method: "POST" });
      loadOverview();
      loadHistory();
    } finally {
      setSeeding(false);
    }
  }

  const byType = (t: string) => data?.accounts.find((a) => a.type === t)?.value ?? 0;
  const has401k = Boolean(data?.accounts.some((a) => a.type === "_401k"));

  return (
    <Shell bare>
      <PageHead
        title="Stocks"
        subtitle="Live value of your 401(k), Roth IRA and brokerage, priced from the market."
        actions={
          <div className="flex gap-2">
            {data && !has401k && (
              <Button onClick={seed401k} disabled={seeding} variant="primary">
                {seeding ? "Seeding…" : "Seed 401(k)"}
              </Button>
            )}
            <Button onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh prices"}
            </Button>
          </div>
        }
      />

      <StatRow>
        <StatTile label="Total invested" value={data ? currency(data.total) : "—"} />
        <StatTile label="401(k)" value={currency(byType("_401k"))} />
        <StatTile label="Roth IRA" value={currency(byType("roth"))} />
        <StatTile label="Brokerage" value={currency(byType("brokerage"))} valueTone="accent" />
      </StatRow>

      <Module>
        <ModuleHead
          title="Growth vs S&P 500"
          subtitle="Your current holdings, back-tested at historical prices, against the index from the same start."
          right={
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-1.5">
                {ACCOUNTS.map((a) => (
                  <Pill key={a.key} active={acct === a.key} onClick={() => setAcct(a.key)}>
                    {a.label}
                  </Pill>
                ))}
              </div>
              <div className="flex gap-1.5">
                {RANGES.map((r) => (
                  <Pill key={r} active={range === r} onClick={() => setRange(r)}>
                    {RANGE_LABEL[r]}
                  </Pill>
                ))}
              </div>
            </div>
          }
        />

        {hist && hist.series.length > 1 ? (
          <>
            <div className="mt-3 flex gap-8">
              <div>
                <Eyebrow>Your investments</Eyebrow>
                <div className="mt-1 font-mono text-body tabular-nums text-accent">
                  {hist.portfolio_return != null ? signedPoints(hist.portfolio_return) : "—"}
                </div>
              </div>
              <div>
                <Eyebrow>S&P 500</Eyebrow>
                <div className="mt-1 font-mono text-body tabular-nums text-muted">
                  {hist.sp500_return != null ? signedPoints(hist.sp500_return) : "—"}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ResponsiveContainer width="99%" height={260}>
                <LineChart data={hist.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#1c212a" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={AXIS}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={44}
                  />
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  <Tooltip
                    formatter={(v: number, n: string) => [
                      currency(v, { cents: true }),
                      n === "portfolio" ? "Your investments" : "S&P 500",
                    ]}
                    labelFormatter={shortDate}
                    contentStyle={{
                      background: "#12151b",
                      border: "1px solid #2a2f3a",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sp500"
                    stroke="#6d7686"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    stroke="#5b8cff"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="mt-4 text-caption text-muted">
            {hist ? "Not enough price history for this selection." : "Loading…"}
          </p>
        )}
      </Module>

      {data?.accounts.map((a) => (
        <Module key={a.id}>
          <ModuleHead
            title={a.name}
            subtitle={`${a.type_label} · ${a.holdings.length} holdings`}
            right={
              <div className="text-right">
                <Eyebrow>Value</Eyebrow>
                <div className="mt-1 text-h2 font-semibold tabular-nums text-fg">
                  {currency(a.value, { cents: true })}
                </div>
              </div>
            }
          />

          <Table
            cols={HOLDING_COLS}
            head={["Ticker", "Name", "Shares", "Price", "Value", "Weight"]}
          >
            {a.holdings.map((h) => (
              <Row key={h.ticker ?? h.name} cols={HOLDING_COLS}>
                <span className="font-mono text-body text-fg">{h.ticker ?? "—"}</span>
                <span className="truncate text-body text-muted">{h.name}</span>
                <span className="text-right font-mono text-micro tabular-nums text-muted">
                  {h.shares.toLocaleString("en-US", { maximumFractionDigits: 3 })}
                </span>
                <span className="text-right tabular-nums text-muted">
                  {h.price != null ? currency(h.price, { cents: true }) : "—"}
                </span>
                <span className="text-right tabular-nums text-fg">
                  {currency(h.value, { cents: true })}
                </span>
                <span className="text-right font-mono text-micro tabular-nums text-dim">
                  {share(h.pct)}
                </span>
              </Row>
            ))}
          </Table>

          {a.contributions.length > 0 && (
            <div className="mt-6">
              <Eyebrow>
                Each pay period · {currency(a.contribution_per_period, { cents: true })}
              </Eyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.contributions.map((c) => (
                  <div
                    key={c.ticker ?? c.name}
                    className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5"
                  >
                    <span className="font-mono text-micro text-fg">{c.ticker}</span>
                    <span className="tabular-nums text-body text-fg">
                      {currency(c.dollars, { cents: true })}
                    </span>
                    <Chip>{share(c.pct)}</Chip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Module>
      ))}

      {data && data.accounts.length === 0 && (
        <Module>
          <p className="text-body text-muted">
            No investment accounts yet. Connect a brokerage/IRA, or seed the 401(k)
            from your fund values.
          </p>
        </Module>
      )}
    </Shell>
  );
}
