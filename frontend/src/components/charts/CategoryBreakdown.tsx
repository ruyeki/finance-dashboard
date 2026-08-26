"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { CategorySpend } from "@/lib/types";
import { colorFor, currency } from "@/lib/format";

export default function CategoryBreakdown({
  data,
  emptyHint = "No spending yet",
}: {
  data: CategorySpend[];
  emptyHint?: string;
}) {
  const total = data.reduce((s, d) => s + d.amount, 0);

  if (!data.length || total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center text-center text-sm text-muted">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="99%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colorFor(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {currency(total)}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {data.slice(0, 8).map((c, i) => (
          <li key={c.category} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colorFor(i) }}
            />
            <span className="flex-1 truncate">{c.category}</span>
            <span className="tabular-nums text-muted">
              {Math.round((c.amount / total) * 100)}%
            </span>
            <span className="w-20 text-right tabular-nums">
              {currency(c.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
