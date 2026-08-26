"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { colorFor, currency, shortDate } from "@/lib/format";

interface Series {
  name: string;
  series: { date: string; balance: number }[];
}

export default function BalanceTrendChart({ data }: { data: Series[] }) {
  // Merge all series into rows keyed by date.
  const byDate = new Map<string, Record<string, number | string>>();
  for (const s of data) {
    for (const point of s.series) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[s.name] = point.balance;
      byDate.set(point.date, row);
    }
  }
  const rows = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  if (!rows.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No balance history yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="99%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: "#8b93a7", fontSize: 12 }}
          axisLine={{ stroke: "#2a2f3a" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#8b93a7", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => currency(v)}
          width={72}
        />
        <Tooltip
          formatter={(v: number, n: string) => [currency(v, { cents: true }), n]}
          labelFormatter={shortDate}
          contentStyle={{
            background: "#1e222b",
            border: "1px solid #2a2f3a",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {data.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colorFor(i)}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
