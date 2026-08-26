import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-panel p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  hintClass = "text-muted",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hintClass?: string;
}) {
  return (
    <Card>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className={`mt-1 text-xs ${hintClass}`}>{hint}</div>}
    </Card>
  );
}
