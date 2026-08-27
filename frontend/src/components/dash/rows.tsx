import { currency, signedCurrency } from "@/lib/format";
import type { MerchantSpend } from "@/lib/types";

export type DeviationRow = {
  label: string;
  value: number;
  average: number;
};

/** Below this, a delta is noise and gets reported as "on average" instead. */
const NOISE = 0.5;

/**
 * Categories against their own six-period average.
 *
 * The bar is this period; the tick is the average for the *same point* in the
 * period. Both are scaled to one shared maximum so rows are comparable to each
 * other, not just to themselves.
 */
export function DeviationRows({
  rows,
  limit,
  emptyHint = "No spending yet this period.",
}: {
  rows: DeviationRow[];
  limit?: number;
  emptyHint?: string;
}) {
  if (!rows.length) {
    return <p className="mt-4 text-caption text-muted">{emptyHint}</p>;
  }

  const sorted = [...rows].sort(
    (a, b) => Math.abs(b.value - b.average) - Math.abs(a.value - a.average),
  );
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.average)), 1);

  return (
    <div className="mt-4">
      {shown.map((r) => {
        const delta = r.value - r.average;
        const flat = Math.abs(delta) < NOISE;
        const fill = flat ? "#6d7686" : delta > 0 ? "#ff6b6b" : "#3ecf8e";
        return (
          <div
            key={r.label}
            className="grid items-center gap-[14px] border-b border-line2 py-[10px] last:border-b-0"
            style={{ gridTemplateColumns: "132px 1fr 74px" }}
          >
            <span className="truncate text-body text-fg">{r.label}</span>

            <div className="relative h-[7px] rounded-sm bg-panel2">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.min((r.value / max) * 100, 100)}%`,
                  background: fill,
                }}
              />
              {r.average > 0 && (
                // Extends past the track so it reads as a reference mark
                // rather than a segment of the bar.
                <span
                  className="absolute top-[-4px] h-[15px] w-px bg-[#6d7686]"
                  style={{ left: `${Math.min((r.average / max) * 100, 100)}%` }}
                  aria-hidden
                />
              )}
            </div>

            <span
              className={`text-right font-mono text-micro tabular-nums ${
                flat ? "text-muted" : delta > 0 ? "text-bad" : "text-good"
              }`}
            >
              {flat ? "on average" : signedCurrency(delta)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Merchants by total spent, each bar scaled to the biggest one. */
export function MerchantRows({
  data,
  limit,
  columns = 1,
  emptyHint = "No merchants yet this period.",
}: {
  data: MerchantSpend[];
  limit?: number;
  columns?: 1 | 2;
  emptyHint?: string;
}) {
  if (!data.length) {
    return <p className="mt-4 text-caption text-muted">{emptyHint}</p>;
  }
  const shown = limit ? data.slice(0, limit) : data;
  const max = Math.max(...shown.map((m) => m.amount), 1);

  return (
    <div
      className={`mt-4 grid gap-x-12 ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}
    >
      {shown.map((m) => (
        <div key={m.merchant} className="py-[9px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body font-medium text-fg">
              {m.merchant}
              {m.count > 1 && (
                <span className="ml-1.5 font-mono text-micro text-dim">
                  ×{m.count}
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-caption tabular-nums text-fg">
              {currency(m.amount, { cents: true })}
            </span>
          </div>
          <div className="mt-1.5 h-[5px] rounded-sm bg-panel2">
            <div
              className="h-full rounded-sm bg-accent"
              style={{ width: `${(m.amount / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
