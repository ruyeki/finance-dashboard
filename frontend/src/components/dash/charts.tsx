"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { currency, share, shortDate } from "@/lib/format";
import { Pill } from "@/components/primitives";
import type { NetWorthPoint, SpendingSummary, Transaction } from "@/lib/types";

const AXIS = { fill: "#5c6474", fontSize: 11, fontFamily: "var(--font-geist-mono)" };
const TOOLTIP = {
  background: "#1a1f27",
  border: "1px solid #262b34",
  borderRadius: 6,
  fontSize: 12,
};

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

/**
 * Net worth over a selectable range.
 *
 * Range handling is carried over from the old NetWorthChart: each pill refetches
 * `networth-history?days=`, rather than slicing one fixed window client-side.
 */
export function NetWorthArea() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<NetWorthPoint[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<NetWorthPoint[]>(`/metrics/networth-history?days=${days}`)
      .then((d) => live && (setData(d), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [days]);

  const { current, change, pct } = useMemo(() => {
    if (data.length < 2) {
      return { current: data[0]?.net_worth ?? 0, change: 0, pct: 0 };
    }
    const first = data[0].net_worth;
    const last = data[data.length - 1].net_worth;
    const ch = last - first;
    return {
      current: last,
      change: ch,
      pct: first !== 0 ? (ch / Math.abs(first)) * 100 : 0,
    };
  }, [data]);

  const [lo, hi] = useMemo(() => {
    if (!data.length) return [0, 1];
    const vals = data.map((d) => d.net_worth);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.25, Math.abs(max) * 0.01, 1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [data]);

  const up = change >= 0;
  const lastIndex = data.length - 1;

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-h2 font-semibold text-fg">Net worth</h2>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-hero font-semibold tabular-nums text-fg">
              {currency(current, { cents: true })}
            </span>
            <span
              className={`font-mono text-body tabular-nums ${up ? "text-good" : "text-bad"}`}
            >
              {up ? "+" : "−"}
              {currency(Math.abs(change))} · {up ? "+" : "−"}
              {Math.abs(pct).toFixed(1)}%
            </span>
          </div>
          <p className="mt-2 text-caption text-muted">
            Cash accounts are exact. Investment balances move only on snapshot
            days.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {RANGES.map((r) => (
            <Pill
              key={r.label}
              active={days === r.days}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {failed ? (
          <p className="py-10 text-caption text-muted">
            Could not load net-worth history.
          </p>
        ) : !data.length ? (
          <p className="py-10 text-caption text-muted">
            No balance snapshots yet for this range.
          </p>
        ) : (
          <ResponsiveContainer width="99%" height={220}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke="#1c212a"
                strokeDasharray="0"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => shortDate(d).toUpperCase()}
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                minTickGap={110}
              />
              <YAxis domain={[lo, hi]} hide />
              <Tooltip
                formatter={(v: number) => [currency(v, { cents: true }), "Net worth"]}
                labelFormatter={shortDate}
                contentStyle={TOOLTIP}
              />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="#5b8cff"
                strokeWidth={2}
                fill="#5b8cff"
                fillOpacity={0.14}
                // Only the latest point is marked, so the eye lands on "now".
                dot={(props: { cx?: number; cy?: number; index?: number }) =>
                  props.index === lastIndex && props.cx != null && props.cy != null ? (
                    <circle
                      key="end"
                      cx={props.cx}
                      cy={props.cy}
                      r={3.5}
                      fill="#5b8cff"
                    />
                  ) : (
                    <g key={props.index} />
                  )
                }
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/**
 * Cumulative spend against the same day of an average period.
 *
 * The average line is the average period total spread evenly across its days,
 * which is what makes "are you ahead of pace" answerable mid-period. The
 * projection continues today's daily rate to the end of the period.
 */
export function PaceChart({
  summary,
  transactions,
}: {
  summary: SpendingSummary;
  transactions: Transaction[];
}) {
  const rows = useMemo(() => {
    const { days_total, days_elapsed, average, daily_avg } = summary;
    const start = new Date(summary.period_start + "T00:00:00");

    // Actual spend per day index (1-based), spending rows only.
    const perDay = new Array(days_total + 1).fill(0);
    for (const t of transactions) {
      if (t.is_income || t.is_transfer || t.amount <= 0) continue;
      const d = new Date(t.date + "T00:00:00");
      const idx = Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
      if (idx >= 1 && idx <= days_total) perDay[idx] += t.amount;
    }

    // Cumulative totals built in place, so no running cursor is captured by
    // the mapping callback.
    const cumulative: number[] = [];
    for (let day = 1, run = 0; day <= days_total; day++) {
      run += perDay[day];
      cumulative[day] = run;
    }

    // Anchor the projection to where actual actually ends, so the two lines
    // always meet. Extending `daily_avg * day` from the origin instead leaves a
    // visible jump whenever the transaction list and the server's total
    // disagree.
    const endOfActual = cumulative[days_elapsed] ?? 0;

    return Array.from({ length: days_total }, (_, i) => {
      const day = i + 1;
      return {
        day,
        avg: (average / days_total) * day,
        actual: day <= days_elapsed ? cumulative[day] : null,
        projected:
          day >= days_elapsed
            ? endOfActual + daily_avg * (day - days_elapsed)
            : null,
      };
    });
  }, [summary, transactions]);

  const actualNow = rows[summary.days_elapsed - 1]?.actual ?? 0;
  const avgNow = rows[summary.days_elapsed - 1]?.avg ?? 0;

  return (
    <div>
      {!transactions.length ? (
        <p className="mt-4 text-caption text-muted">
          No transactions yet this period.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <ResponsiveContainer width="99%" height={200}>
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} hide />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => currency(v, { cents: true })}
                  labelFormatter={(d) => `Day ${d}`}
                  contentStyle={TOOLTIP}
                />
                <Line
                  type="linear"
                  dataKey="avg"
                  stroke="#6d7686"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Average period"
                />
                <Line
                  type="linear"
                  dataKey="projected"
                  stroke="#ff6b6b"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                  name="Projected"
                />
                <Line
                  type="linear"
                  dataKey="actual"
                  stroke="#ff6b6b"
                  strokeWidth={2}
                  dot={false}
                  name="Actual"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-1 flex justify-between border-t border-line pt-2 font-mono text-eyebrow uppercase text-dim">
            <span>Day 1</span>
            <span>Day {summary.days_elapsed} — today</span>
            <span>Day {summary.days_total}</span>
          </div>

          <div className="mt-4 space-y-2">
            <LegendLine
              color="#ff6b6b"
              label={`Actual, ${currency(actualNow, { cents: true })} by day ${summary.days_elapsed}`}
            />
            <LegendLine
              color="#6d7686"
              dashed
              label={`Average period, ${currency(avgNow, { cents: true })} by day ${summary.days_elapsed}`}
            />
            <LegendLine
              color="#ff6b6b"
              dashed
              label={`Projected finish, ${currency(summary.projected, { cents: true })}`}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LegendLine({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-0 w-4 shrink-0"
        style={{
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      <span className="text-caption text-muted">{label}</span>
    </div>
  );
}

const SERIES_COLORS = ["#5b8cff", "#3ecf8e", "#a78bfa", "#22d3ee", "#f5a623"];

export function AccountBalances({
  data,
}: {
  data: { name: string; series: { date: string; balance: number }[] }[];
}) {
  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of data) {
      for (const p of s.series) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.name] = p.balance;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [data]);

  if (!rows.length) {
    return (
      <p className="mt-4 text-caption text-muted">No balance snapshots yet.</p>
    );
  }

  const latest = rows[rows.length - 1];

  return (
    <div>
      <div className="mt-4">
        <ResponsiveContainer width="99%" height={230}>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={(d) => shortDate(d).toUpperCase()}
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => currency(v, { cents: true })}
              labelFormatter={shortDate}
              contentStyle={TOOLTIP}
            />
            {data.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5">
        {data.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2.5">
            <span
              className="h-0 w-3.5 shrink-0"
              style={{
                borderTop: `2px solid ${SERIES_COLORS[i % SERIES_COLORS.length]}`,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-body text-fg">
              {s.name}
            </span>
            <span className="shrink-0 font-mono text-micro tabular-nums text-muted">
              {typeof latest[s.name] === "number"
                ? currency(latest[s.name] as number)
                : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Proportional split of every account across net worth. */
export function AssetsLiabilities({
  accounts,
}: {
  accounts: { name: string; balance: number }[];
}) {
  const positive = accounts.filter((a) => a.balance > 0);
  const total = positive.reduce((s, a) => s + a.balance, 0);
  if (!total) {
    return <p className="mt-4 text-caption text-muted">No accounts yet.</p>;
  }
  return (
    <div>
      <div className="mt-4 flex h-3.5 gap-0.5">
        {positive.map((a, i) => (
          <div
            key={a.name}
            className="rounded-sm"
            style={{
              width: `${(a.balance / total) * 100}%`,
              background: SERIES_COLORS[i % SERIES_COLORS.length],
            }}
            title={`${a.name} · ${currency(a.balance, { cents: true })}`}
          />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-5 gap-6">
        {positive.map((a, i) => (
          <div key={a.name}>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="truncate text-body text-fg">{a.name}</span>
            </div>
            <div className="mt-1.5 font-mono text-[15px] tabular-nums text-fg">
              {currency(a.balance, { cents: true })}
            </div>
            <div className="mt-0.5 font-mono text-micro text-muted">
              {share((a.balance / total) * 100)} of net worth
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
