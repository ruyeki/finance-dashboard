import { ReactNode } from "react";

/**
 * Structural primitives for the redesigned analytical screens.
 *
 * These live apart from `ui.tsx` on purpose: Accounts, Paychecks and Settings
 * are outside the redesign and still render the old `Card` / `Stat` / `PageHeader`.
 * Replacing those in place would have broken three working screens.
 *
 * The layout language here is a hairline grid — no rounded cards, no shadows.
 * Modules are separated by full-width rules; columns by a rule on the divider.
 */

export type Tone = "good" | "bad" | "warn" | "muted" | "accent" | "dim" | "fg";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-good",
  bad: "text-bad",
  warn: "text-warn",
  muted: "text-muted",
  accent: "text-accent",
  dim: "text-dim",
  fg: "text-fg",
};

export function toneClass(tone: Tone = "muted"): string {
  return TONE_CLASS[tone];
}

/** 10px mono, 0.1em tracking, uppercase. The label above every figure. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`font-mono text-eyebrow uppercase text-muted ${className}`}>
      {children}
    </div>
  );
}

/** Page header: title and subtitle left, actions right, closed by a hairline. */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-line px-8 pb-5 pt-6">
      <div>
        <h1 className="text-title font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

/** A content module. Full-width hairline underneath separates it from the next. */
export function Module({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-line px-8 pb-[30px] pt-[26px] ${className}`}>
      {children}
    </section>
  );
}

/** Module heading: h2 plus optional subtitle, with an optional right-hand slot. */
export function ModuleHead({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-6 ${className}`}>
      <div>
        <h2 className="text-h2 font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-1 text-caption text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Four equal stat columns, divided by hairlines. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-4 divide-x divide-line border-b border-line">
      {children}
    </div>
  );
}

/**
 * One stat: eyebrow, then the figure and its delta on a shared baseline, then a note.
 * The delta is deliberately a sibling of the figure rather than a line of its own —
 * baseline alignment is what makes the row scan.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = "muted",
  note,
  valueTone = "fg",
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: Tone;
  note?: ReactNode;
  valueTone?: Tone;
}) {
  return (
    <div className="px-6 pb-5 pt-[18px]">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-stat font-semibold tabular-nums ${toneClass(valueTone)}`}>
          {value}
        </span>
        {delta && (
          <span className={`font-mono text-micro tabular-nums ${toneClass(deltaTone)}`}>
            {delta}
          </span>
        )}
      </div>
      {note && <p className="mt-2 text-caption text-muted">{note}</p>}
    </div>
  );
}

/** Two- or three-column module body, split by a hairline on the divider. */
export function Split({
  children,
  cols = 2,
  className = "",
}: {
  children: ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={`grid divide-x divide-line ${
        cols === 3 ? "grid-cols-3" : "grid-cols-2"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** A small mono pill. Used for range and comparison-basis selectors. */
export function Pill({
  children,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      disabled={!interactive}
      className={`rounded-md border px-2.5 py-1 font-mono text-micro uppercase tracking-wider transition-colors ${
        active
          ? "border-edge bg-[#1b2028] text-fg"
          : "border-line text-dim"
      } ${interactive ? "hover:text-fg" : "cursor-default"}`}
    >
      {children}
    </button>
  );
}

/**
 * Comparison-basis selector shown on every screen header.
 *
 * Inert by design: the metrics endpoints do not accept a basis parameter yet,
 * so wiring it would produce controls that silently do nothing. It ships
 * disabled until the API supports it.
 */
export function BasisPills() {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Comparison basis">
      <Pill active title="Comparison basis is not configurable yet">
        This period
      </Pill>
      <Pill title="Comparison basis is not configurable yet">Last 6 avg</Pill>
      <Pill title="Comparison basis is not configurable yet">Year to date</Pill>
    </div>
  );
}
