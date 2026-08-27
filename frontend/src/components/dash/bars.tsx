import { currency, share, shortDate } from "@/lib/format";
import type { KeepRatePoint, TrendPoint } from "@/lib/types";

const TIER_STACK = [
  { key: "fixed", label: "Fixed", color: "#3b4250" },
  { key: "essential", label: "Essentials", color: "#6d7686" },
  { key: "discretionary", label: "Discretionary", color: "#ff6b6b" },
] as const;

/** Headroom above the tallest column so its total label has somewhere to sit. */
const HEADROOM = 1.16;
const HEIGHT = 260;

/**
 * Spending per period, stacked by tier.
 *
 * The single-series bar chart this replaces could show that a period was
 * expensive but not why. Stacking by tier makes the answer structural: fixed
 * and essentials barely move, so the discretionary band is the variable one.
 */
export function TierStackedBars({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return <p className="mt-4 text-caption text-muted">No completed periods yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.total), 1);
  const scale = HEIGHT / (max * HEADROOM);
  const average = data[0]?.average ?? 0;

  return (
    <div className="mt-6">
      <div className="relative flex items-end gap-[14px]" style={{ height: HEIGHT }}>
        {average > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-warn"
            style={{ bottom: average * scale }}
            aria-hidden
          />
        )}

        {data.map((d) => {
          const above = d.total > average;
          return (
            <div
              key={d.period_start}
              className="relative flex min-w-0 flex-1 flex-col justify-end"
              style={{ height: HEIGHT }}
            >
              <span
                className={`absolute inset-x-0 z-10 text-center font-mono text-micro tabular-nums ${
                  above ? "text-bad" : "text-muted"
                }`}
                // Sits in an ink chip so it masks the average rule behind it
                // instead of colliding with it.
                style={{ bottom: d.total * scale + 6 }}
              >
                <span className="bg-ink px-1">{currency(d.total)}</span>
              </span>

              <div className="flex flex-col-reverse gap-0.5">
                {TIER_STACK.map((t, i) => {
                  const v = d.by_tier?.[t.key] ?? 0;
                  if (v <= 0) return null;
                  const isTop = i === TIER_STACK.length - 1;
                  return (
                    <div
                      key={t.key}
                      style={{
                        height: Math.max(v * scale, 1),
                        background: t.color,
                        borderTopLeftRadius: isTop ? 3 : 0,
                        borderTopRightRadius: isTop ? 3 : 0,
                      }}
                      title={`${t.label} · ${currency(v, { cents: true })}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-[14px]">
        {data.map((d) => (
          <div
            key={d.period_start}
            className="min-w-0 flex-1 text-center font-mono text-eyebrow uppercase text-dim"
          >
            {shortDate(d.period_start)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TierLegend({ average }: { average: number }) {
  return (
    <div className="flex items-center gap-4">
      {TIER_STACK.map((t) => (
        <span key={t.key} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ background: t.color }}
          />
          <span className="text-caption text-muted">{t.label}</span>
        </span>
      ))}
      {average > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-warn" />
          <span className="font-mono text-micro text-warn">
            6-period avg {currency(average, { cents: true })}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * Keep rate per period. The current period is highlighted; everything else is
 * neutral, because the point is where *this* period sits against the run.
 */
export function KeepRateBars({ data }: { data: KeepRatePoint[] }) {
  const usable = data.filter((d) => d.keep_rate !== null);
  if (!usable.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        Needs at least one period with a paycheck.
      </p>
    );
  }

  const max = Math.max(...usable.map((d) => d.keep_rate as number), 1);
  const now = data[data.length - 1];
  const average = now?.average ?? null;

  return (
    <div className="mt-5">
      <div className="flex items-end gap-1.5" style={{ height: 150 }}>
        {data.map((d, i) => {
          const v = d.keep_rate;
          const isNow = i === data.length - 1;
          return (
            <div
              key={d.period_start}
              className="min-w-0 flex-1 rounded-t-[3px]"
              style={{
                height: v === null ? 2 : `${Math.max((v / max) * 100, 1)}%`,
                background: v === null ? "#1c212a" : isNow ? "#f5a623" : "#2b3341",
              }}
              title={
                v === null
                  ? `${shortDate(d.period_start)} · no paycheck`
                  : `${shortDate(d.period_start)} · ${share(v)}`
              }
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between font-mono text-eyebrow uppercase text-dim">
        <span>{shortDate(data[0].period_start)}</span>
        {now?.keep_rate !== null && now !== undefined && (
          <span className="text-warn">
            Now {share(now.keep_rate as number)}
            {average !== null && ` · avg ${share(average)}`}
          </span>
        )}
        <span>{shortDate(data[data.length - 1].period_start)}</span>
      </div>
    </div>
  );
}
