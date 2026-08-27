"use client";

import { useEffect, useRef, useState } from "react";
import { currency, share } from "@/lib/format";

export type BandTone = "accent" | "good" | "bad" | "neutral" | "neutral2";

export type Band = {
  key: string;
  label: string;
  value: number;
  tone: BandTone;
  /** Overrides the "amount · share" line. Used for "vs average" comparisons. */
  detail?: string;
};

const TONE: Record<BandTone, { bg: string; rule: string; border: string }> = {
  accent: { bg: "#151a26", rule: "#5b8cff", border: "#2f3a52" },
  good: { bg: "#15211c", rule: "#3ecf8e", border: "#25443a" },
  bad: { bg: "#231619", rule: "#ff6b6b", border: "#3a2126" },
  neutral: { bg: "#181c22", rule: "#8b93a7", border: "#2a303a" },
  neutral2: { bg: "#1a1f27", rule: "#6d7686", border: "#2a303a" },
};

/**
 * A single proportional row: every band's width is its share of `total`.
 *
 * Below `MIN_INLINE` a band cannot hold a legible money figure, so its text
 * moves to a caption underneath rather than being truncated — a clipped dollar
 * amount is worse than none. That threshold is in pixels, so the row measures
 * itself rather than guessing from the viewport.
 */
const MIN_INLINE = 96;

export function BandRow({
  bands,
  total,
  height = 66,
  showShare = true,
}: {
  bands: Band[];
  total: number;
  height?: number;
  showShare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const denom = total > 0 ? total : 1;
  const visible = bands.filter((b) => b.value > 0);
  const anyCaption = visible.some(
    (b) => width > 0 && (b.value / denom) * width < MIN_INLINE,
  );

  if (!visible.length) {
    return (
      <p className="mt-4 text-caption text-muted">
        Add a paycheck and some transactions to see the split.
      </p>
    );
  }

  return (
    <div
      ref={ref}
      className="relative mt-4 flex gap-1.5"
      style={{ height, marginBottom: anyCaption ? 18 : 0 }}
    >
      {visible.map((b) => {
        const pct = (b.value / denom) * 100;
        const px = width > 0 ? (b.value / denom) * width : Infinity;
        const inline = px >= MIN_INLINE;
        const tone = TONE[b.tone];
        return (
          <div
            key={b.key}
            className="relative min-w-0 rounded"
            style={{
              width: `${pct}%`,
              background: tone.bg,
              borderTop: `2px solid ${tone.rule}`,
              border: `1px solid ${tone.border}`,
              borderTopWidth: 2,
              borderTopColor: tone.rule,
            }}
            title={`${b.label} · ${currency(b.value, { cents: true })} · ${share(pct)}`}
          >
            {inline ? (
              <div className="px-3 py-2.5">
                <div className="truncate text-caption font-medium text-fg">
                  {b.label}
                </div>
                <div className="mt-1 truncate font-mono text-micro tabular-nums text-muted">
                  {currency(b.value, { cents: true })}
                  {b.detail ? ` · ${b.detail}` : showShare ? ` · ${share(pct)}` : ""}
                </div>
              </div>
            ) : (
              <span className="absolute left-0 top-full mt-1 whitespace-nowrap font-mono text-eyebrow text-muted">
                {b.label} · {currency(b.value, { cents: true })}
                {b.detail ? ` · ${b.detail}` : showShare ? ` · ${share(pct)}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
