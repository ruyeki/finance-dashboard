export function currency(n: number, opts: { cents?: boolean } = {}): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function signedCurrency(n: number, opts: { cents?: boolean } = {}): string {
  const s = currency(Math.abs(n), opts);
  return n < 0 ? `−${s}` : `+${s}`;
}

/** Parse a bare `YYYY-MM-DD` as local midnight, not UTC. */
export function parseISODate(iso: string): Date {
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
}

export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "Sat, Aug 29" — the next-payday line in the sidebar. */
export function weekdayDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Whole calendar days from `from` to `iso`. Negative when already past. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = parseISODate(iso);
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function relativeDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n < 0 ? `${Math.abs(n)} days ago` : `in ${n} days`;
}

/** Unsigned share, for allocations: "31.2%". */
export function share(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/** Signed points, for changes in a rate: "−2.2 pts". */
export function signedPoints(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits);
  return `${n < 0 ? "−" : "+"}${s} pts`;
}

/** "Aug 15 – Aug 29 · biweekly · day 11 of 14" — the subtitle on every screen. */
export function periodLabel(s: {
  period_start: string;
  period_end: string;
  cadence: string;
  days_elapsed: number;
  days_total: number;
}): string {
  return `${shortDate(s.period_start)} – ${shortDate(s.period_end)} · ${s.cadence} · day ${s.days_elapsed} of ${s.days_total}`;
}

export const CATEGORY_COLORS = [
  "#5b8cff",
  "#3ecf8e",
  "#f5a623",
  "#ff6b6b",
  "#a78bfa",
  "#22d3ee",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#fb923c",
  "#60a5fa",
  "#c084fc",
];

export function colorFor(i: number): string {
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

/** Neutral chart greys, light to dark. Used where colour must not carry meaning. */
export const NEUTRALS = ["#8b93a7", "#6d7686", "#3b4250", "#2b3341"];
