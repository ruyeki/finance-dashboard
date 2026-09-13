"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { currency } from "@/lib/format";

const COLORS = [
  "#5b8cff",
  "#3ecf8e",
  "#a78bfa",
  "#22d3ee",
  "#f5a623",
  "#ff6b6b",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#c084fc",
  "#2dd4bf",
  "#6d7686",
];

export type Slice = { label: string; value: number; color?: string; sub?: string };

/**
 * Donut with a centered total and a legend. Slices must be positive; pass
 * abs() for liabilities and colour them if the sign matters.
 */
const SIZES = {
  md: { box: "h-52 w-52", inner: 66, outer: 96 },
  lg: { box: "h-64 w-64", inner: 86, outer: 124 },
} as const;

export function Donut({
  data,
  centerLabel,
  centerValue,
  size = "md",
  emptyHint = "Nothing to show yet.",
}: {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string;
  size?: "md" | "lg";
  emptyHint?: string;
}) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (!total) {
    return <p className="mt-4 text-caption text-muted">{emptyHint}</p>;
  }
  const color = (s: Slice, i: number) => s.color ?? COLORS[i % COLORS.length];
  const dim = SIZES[size];

  return (
    <div className="mt-4 flex flex-col items-center gap-8 sm:flex-row">
      <div className={`relative ${dim.box} shrink-0`}>
        <ResponsiveContainer width="99%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={dim.inner}
              outerRadius={dim.outer}
              paddingAngle={1.5}
              stroke="none"
              isAnimationActive
              animationBegin={80}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {slices.map((s, i) => (
                <Cell key={i} fill={color(s, i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, n: string) => [currency(v, { cents: true }), n]}
              contentStyle={{
                background: "#12151b",
                border: "1px solid #2a2f3a",
                borderRadius: 6,
                fontSize: 12,
              }}
              itemStyle={{ color: "#eef1f6" }}
              labelStyle={{ color: "#eef1f6" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && (
            <span className="font-mono text-eyebrow uppercase text-dim">
              {centerLabel}
            </span>
          )}
          <span className="text-h2 font-semibold tabular-nums text-fg">
            {centerValue ?? currency(total)}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-body">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: color(s, i) }}
            />
            <span className="flex-1 truncate text-fg">
              {s.label}
              {s.sub && <span className="ml-2 text-micro text-dim">{s.sub}</span>}
            </span>
            <span className="font-mono text-micro tabular-nums text-dim">
              {Math.round((s.value / total) * 100)}%
            </span>
            <span className="w-20 text-right font-mono text-micro tabular-nums text-muted">
              {currency(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
