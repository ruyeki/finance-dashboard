"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import {
  Eyebrow,
  Module,
  ModuleHead,
  PageHead,
  StatRow,
  StatTile,
} from "@/components/primitives";
import { Button, Chip, Row, Table } from "@/components/dash/controls";
import { AccountBalances } from "@/components/dash/charts";
import { api } from "@/lib/api";
import { currency, share } from "@/lib/format";

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
  history: { date: string; value: number }[];
}
interface BalanceSeries {
  name: string;
  type: string;
  series: { date: string; balance: number }[];
}

const HOLDING_COLS = "72px 1fr 96px 96px 110px 64px";

export default function StocksPage() {
  const [data, setData] = useState<StocksData | null>(null);
  const [series, setSeries] = useState<BalanceSeries[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    api<StocksData>("/stocks").then(setData).catch(() => {});
    api<BalanceSeries[]>("/metrics/balance-trends")
      .then((s) => setSeries(s.filter((x) => ["roth", "_401k", "brokerage"].includes(x.type))))
      .catch(() => {});
  }
  useEffect(load, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await api("/stocks/refresh", { method: "POST" });
      load();
    } finally {
      setRefreshing(false);
    }
  }

  const byType = (t: string) => data?.accounts.find((a) => a.type === t)?.value ?? 0;

  return (
    <Shell bare>
      <PageHead
        title="Stocks"
        subtitle="Live value of your 401(k), Roth IRA and brokerage, priced from the market."
        actions={
          <Button onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh prices"}
          </Button>
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
          title="Portfolio value over time"
          subtitle="Daily snapshots from live prices; fills in as the daily job runs."
        />
        <AccountBalances
          data={series.map((s) => ({ name: s.name, series: s.series }))}
        />
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
            No investment accounts yet. Connect a brokerage/IRA, or the 401(k) can be
            seeded from your fund values.
          </p>
        </Module>
      )}
    </Shell>
  );
}
