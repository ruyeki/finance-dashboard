"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { currency, signedCurrency } from "@/lib/format";
import { NetWorthPoint } from "@/lib/types";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

export default function NetWorthChart() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<NetWorthPoint[]>([]);

  useEffect(() => {
    api<NetWorthPoint[]>(`/metrics/networth-history?days=${days}`)
      .then(setData)
      .catch(() => {});
  }, [days]);

  const { current, change, pct, up } = useMemo(() => {
    if (data.length < 2) {
      const c = data[0]?.net_worth ?? 0;
      return { current: c, change: 0, pct: 0, up: true };
    }
    const first = data[0].net_worth;
    const last = data[data.length - 1].net_worth;
    const ch = last - first;
    return {
      current: last,
      change: ch,
      pct: first !== 0 ? (ch / Math.abs(first)) * 100 : 0,
      up: ch >= 0,
    };
  }, [data]);

  const [lo, hi] = useMemo(() => {
    if (!data.length) return [0, 1];
    const vals = data.map((d) => d.net_worth);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.2, Math.abs(max) * 0.01, 1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [data]);

  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted">Net worth</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">
            {currency(current)}
          </div>
          <div className={`mt-1 text-sm ${up ? "text-good" : "text-bad"}`}>
            {signedCurrency(change)} ({up ? "+" : ""}
            {pct.toFixed(1)}%)
            <span className="ml-1 text-muted">this range</span>
          </div>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                days === r.days
                  ? "bg-panel2 text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <ResponsiveContainer width="99%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={fmt}
              tick={{ fill: "#8b93a7", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[lo, hi]}
              tick={{ fill: "#8b93a7", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => currency(v)}
            />
            <Tooltip
              formatter={(v: number) => [currency(v, { cents: true }), "Net worth"]}
              labelFormatter={fmt}
              contentStyle={{
                background: "#1e222b",
                border: "1px solid #2a2f3a",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke="#5b8cff"
              strokeWidth={2}
              fill="url(#nwFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
