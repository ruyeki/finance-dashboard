"use client";

import { MerchantSpend } from "@/lib/types";
import { currency } from "@/lib/format";

export default function MerchantList({ data }: { data: MerchantSpend[] }) {
  if (!data.length) {
    return <p className="text-sm text-muted">No spending yet.</p>;
  }
  const max = data[0].amount || 1;
  return (
    <ul className="space-y-3">
      {data.map((m) => (
        <li key={m.merchant}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="truncate pr-2">
              {m.merchant}
              {m.count > 1 && (
                <span className="ml-1 text-xs text-muted">×{m.count}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              {currency(m.amount, { cents: true })}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(m.amount / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
