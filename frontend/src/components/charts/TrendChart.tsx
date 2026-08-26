"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendPoint } from "@/lib/types";
import { currency, shortDate } from "@/lib/format";

export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const chart = data.map((p) => ({
    label: shortDate(p.period_start),
    total: p.total,
    average: p.average,
  }));
  return (
    <ResponsiveContainer width="99%" height={260}>
      <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#8b93a7", fontSize: 12 }}
          axisLine={{ stroke: "#2a2f3a" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#8b93a7", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => currency(v)}
          width={64}
        />
        <Tooltip
          formatter={(v: number, n: string) => [
            currency(v, { cents: true }),
            n === "total" ? "Spent" : "Average",
          ]}
          contentStyle={{
            background: "#1e222b",
            border: "1px solid #2a2f3a",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#e5e7eb" }}
        />
        <Bar dataKey="total" fill="#5b8cff" radius={[4, 4, 0, 0]} maxBarSize={44} />
        <Line
          dataKey="average"
          stroke="#f5a623"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
