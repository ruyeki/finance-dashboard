"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CategorySpend } from "@/lib/types";
import { colorFor, currency } from "@/lib/format";

export default function CategoryDonut({ data }: { data: CategorySpend[] }) {
  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        No spending yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="99%" height={224}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="category"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colorFor(i)} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, n: string) => [currency(v, { cents: true }), n]}
          contentStyle={{
            background: "#1e222b",
            border: "1px solid #2a2f3a",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
