import { currency, signedCurrency } from "@/lib/format";
import type {
  ContributionGoal,
  RecurringCharges,
  SpendingSummary,
} from "@/lib/types";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/types";

export type Insight = { key: string; title: string; body: string; tone: string };

/**
 * "Worth watching" notes.
 *
 * The handoff supplies these as fixed copy, but every sentence in it contains a
 * figure ("$75 above average", "the first travel charge in four periods").
 * Shipping those literally would print claims about a dataset that is not
 * yours, so each note is derived and omitted when its condition does not hold.
 */
export function buildInsights(
  summary: SpendingSummary | null,
  goals: ContributionGoal[],
): Insight[] {
  const out: Insight[] = [];
  if (!summary) return out;

  const tiers = summary.by_tier;
  const avgs = summary.tier_averages;
  if (tiers && avgs) {
    const moves = (["discretionary", "essential", "fixed"] as const).map((k) => ({
      k,
      delta: (tiers[k] ?? 0) - (avgs[k] ?? 0),
    }));
    const biggest = [...moves].sort(
      (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
    )[0];
    const others = moves.filter((m) => m.k !== biggest.k);
    if (biggest && Math.abs(biggest.delta) >= 1) {
      const label =
        biggest.k === "discretionary"
          ? "Discretionary"
          : biggest.k === "essential"
            ? "Essentials"
            : "Fixed bills";
      out.push({
        key: "tier",
        tone: biggest.delta > 0 ? "#ff6b6b" : "#3ecf8e",
        title:
          biggest.k === "discretionary"
            ? "Discretionary is the whole story"
            : `${label} moved most this period`,
        body:
          `${label} is ${signedCurrency(biggest.delta)} against its average, while ` +
          others
            .map(
              (o) =>
                `${o.k === "fixed" ? "fixed bills" : o.k === "essential" ? "essentials" : "discretionary"} moved ${signedCurrency(o.delta)}`,
            )
            .join(" and ") +
          ".",
      });
    }
  }

  // A category with spend but no history is new this period — the "one-off"
  // note, derived rather than asserted.
  const catAvgs = summary.category_averages ?? {};
  const fresh = (summary.by_category ?? [])
    .filter((c) => c.amount > 0 && (catAvgs[c.category] ?? 0) === 0)
    .sort((a, b) => b.amount - a.amount)[0];
  if (fresh) {
    out.push({
      key: "new",
      tone: "#f5a623",
      title: `${fresh.category} was a one-off`,
      body: `${currency(fresh.amount, { cents: true })} in ${fresh.category}, with nothing in the previous six periods. Strip it out and this period looks different.`,
    });
  }

  for (const g of goals) {
    if (g.needed_per_month > 0 && g.months_left > 0) {
      const label =
        ACCOUNT_TYPE_LABELS[g.account_type as AccountType] ?? g.account_type;
      const projected =
        g.pace_percent > 0
          ? (g.contributed_ytd / g.pace_percent) * 100
          : g.contributed_ytd;
      out.push({
        key: `goal-${g.account_type}`,
        tone: g.behind > 0 ? "#f5a623" : "#3ecf8e",
        title: `${label} needs ${currency(g.needed_per_month)}/month`,
        body: `${currency(g.contributed_ytd)} of ${currency(g.limit)} with ${g.months_left} month${g.months_left === 1 ? "" : "s"} left. Current pace lands at ${currency(projected)}.`,
      });
    }
  }

  return out.slice(0, 3);
}

export function WorthWatching({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        Nothing unusual this period.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-4">
      {insights.map((n) => (
        <div key={n.key} className="pl-3" style={{ borderLeft: `3px solid ${n.tone}` }}>
          <div className="text-body font-medium text-fg">{n.title}</div>
          <p className="mt-1 text-caption leading-[1.55] text-muted">{n.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Contribution goals with a pace marker at the share of the year elapsed. */
export function RetirementPace({ goals }: { goals: ContributionGoal[] }) {
  if (!goals.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        Set a contribution goal in Settings.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-5">
      {goals.map((g) => {
        const label =
          ACCOUNT_TYPE_LABELS[g.account_type as AccountType] ?? g.account_type;
        const behind = g.behind > 0;
        return (
          <div key={g.account_type}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-body text-fg">
                {label} {g.year}
              </span>
              <span className="font-mono text-micro tabular-nums text-muted">
                {currency(g.contributed_ytd)} of {currency(g.limit)}
              </span>
            </div>
            <div className="relative mt-2 h-[7px] rounded-sm bg-panel2">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.min(g.percent, 100)}%`,
                  background: behind ? "#f5a623" : "#3ecf8e",
                }}
              />
              <span
                className="absolute top-[-3px] h-[13px] w-px bg-white/70"
                style={{ left: `${Math.min(g.pace_percent, 100)}%` }}
                title={`Pace: ${g.pace_percent}% of the year elapsed`}
                aria-hidden
              />
            </div>
            <div
              className={`mt-1.5 font-mono text-micro ${behind ? "text-warn" : "text-good"}`}
            >
              {behind ? `${currency(g.behind)} behind pace` : "On pace"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SWATCHES = ["#5b8cff", "#3ecf8e", "#a78bfa", "#22d3ee", "#f5a623", "#f472b6"];

export function RecurringList({ data }: { data: RecurringCharges | null }) {
  if (!data || !data.items.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        No monthly charges detected yet — this needs a few months of history.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <span className="text-section font-semibold tabular-nums text-fg">
          {currency(data.monthly_total, { cents: true })}
        </span>
        <span className="font-mono text-micro uppercase text-muted">
          /mo · {currency(data.annual_total, { cents: true })}/yr
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {data.items.slice(0, 6).map((it, i) => (
          <div key={it.merchant} className="flex items-center gap-2.5">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: SWATCHES[i % SWATCHES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-body text-fg">
              {it.merchant}
            </span>
            <span className="shrink-0 font-mono text-micro text-muted">
              {it.cadence}
            </span>
            <span className="shrink-0 font-mono text-caption tabular-nums text-fg">
              {currency(it.amount, { cents: true })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
