import { ReactNode } from "react";

/**
 * Form and table controls in the hairline-grid language.
 *
 * The four analytical screens are read-only, so they never needed these. The
 * Accounts, Paychecks and Settings screens are mostly forms and tables, which
 * is why the design language has to be extended rather than just applied.
 */

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line text-fg hover:border-edge",
  danger: "border border-line text-bad hover:border-bad",
};

export function Button({
  children,
  variant = "secondary",
  type = "button",
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1.5 text-body transition-colors disabled:opacity-50 ${BUTTON[variant]}`}
    >
      {children}
    </button>
  );
}

const CONTROL =
  "w-full rounded-md border border-line bg-panel2 px-3 py-2 text-body text-fg outline-none transition-colors focus:border-accent";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="font-mono text-eyebrow uppercase text-muted">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1.5 block text-caption text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL} ${props.className ?? ""}`}>
      {props.children}
    </select>
  );
}

export type ChipTone = "neutral" | "accent" | "good" | "warn" | "bad";

const CHIP: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: "#1a1f27", fg: "#8b93a7" },
  accent: { bg: "#151a26", fg: "#5b8cff" },
  good: { bg: "#15211c", fg: "#3ecf8e" },
  warn: { bg: "#221c12", fg: "#f5a623" },
  bad: { bg: "#231619", fg: "#ff9a8f" },
};

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: ChipTone;
}) {
  const c = CHIP[tone];
  return (
    <span
      className="inline-block rounded px-2 py-[3px] font-mono text-eyebrow uppercase tracking-[0.06em]"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

/** Hairline table. `cols` is a grid-template-columns string. */
export function Table({
  cols,
  head,
  minWidth = 720,
  children,
}: {
  cols: string;
  head: ReactNode[];
  minWidth?: number;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <div style={{ minWidth }}>
        <div
          className="grid gap-4 border-b border-line pb-2 font-mono text-eyebrow uppercase text-dim"
          style={{ gridTemplateColumns: cols }}
        >
          {head.map((h, i) => (
            <span key={i}>{h}</span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Row({
  cols,
  children,
}: {
  cols: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid items-center gap-4 border-b border-line2 py-3"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-6 text-caption text-muted">{children}</p>;
}

/** Inline link-style action inside a table row. */
export function RowAction({
  children,
  onClick,
  tone = "accent",
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "accent" | "bad";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-micro transition-colors ${
        tone === "bad" ? "text-bad hover:text-bad/80" : "text-accent hover:text-accent/80"
      }`}
    >
      {children}
    </button>
  );
}
