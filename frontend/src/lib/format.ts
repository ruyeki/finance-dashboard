export function currency(n: number, opts: { cents?: boolean } = {}): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function signedCurrency(n: number): string {
  const s = currency(Math.abs(n));
  return n < 0 ? `−${s}` : `+${s}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
