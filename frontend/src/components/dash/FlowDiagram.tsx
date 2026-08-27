"use client";

import { useMemo, useState } from "react";
import { currency, share, signedCurrency, weekdayDate } from "@/lib/format";
import type { FlowData, FlowNode } from "@/lib/types";

/* Geometry, in px inside a 1168x812 box. Straight from the handoff. */
const W = 1168;
const BOX_H = 812;
const H = 700; // pixel height of gross pay
const GAP1 = 14;
const GAP2 = 12;
const X0R = 168;
const X1L = 460;
const X1R = 648;
const X2L = 940;
const CARD_W = 188;
const LABEL_W = 228;
const BAR_W = 10;

/** A note only fits inside a card taller than this. */
const NOTE_MIN_H = 96;

const COLORS: Record<string, string> = {
  withheld: "#8b93a7",
  k401: "#3ecf8e",
  takehome: "#5b8cff",
  fixed: "#6d7686",
  essential: "#8b93a7",
  discretionary: "#ff6b6b",
  unclassified: "#3b4250",
  kept: "#3ecf8e",
};

const CARD_STYLE: Record<string, { bg: string; border: string }> = {
  withheld: { bg: "#181c22", border: "#2a303a" },
  k401: { bg: "#15211c", border: "#25443a" },
  takehome: { bg: "#151a26", border: "#2f3a52" },
};

/**
 * Filled cubic band between two vertical spans. Ribbons are filled paths, not
 * thick strokes, so thickness reads as dollars at both ends.
 */
function ribbon(
  x0: number,
  ys0: number,
  ys1: number,
  x1: number,
  yt0: number,
  yt1: number,
): string {
  const mx = (x0 + x1) / 2;
  return [
    `M ${x0} ${ys0}`,
    `C ${mx} ${ys0}, ${mx} ${yt0}, ${x1} ${yt0}`,
    `L ${x1} ${yt1}`,
    `C ${mx} ${yt1}, ${mx} ${ys1}, ${x0} ${ys1}`,
    "Z",
  ].join(" ");
}

type Placed = FlowNode & { y: number; h: number };

export function FlowDiagram({ data }: { data: FlowData }) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const scale = data.gross > 0 ? H / data.gross : 0;

    // Plain loops rather than map() with a running total: a cursor captured by
    // a callback is exactly what the compiler's immutability rule rejects.
    const s1: Placed[] = [];
    for (let i = 0, y = 0; i < data.split1.length; i++) {
      const n = data.split1[i];
      const h = n.value * scale;
      s1.push({ ...n, y, h });
      y += h + GAP1;
    }

    const takehome = s1.find((n) => n.key === "takehome");
    const heights = data.split2.map((n) => n.value * scale);
    const span =
      heights.reduce((a, b) => a + b, 0) + GAP2 * Math.max(heights.length - 1, 0);
    // Centre the terminal group on take-home, so the second split reads as
    // fanning out of it rather than starting from the top of the canvas.
    const s2: Placed[] = [];
    for (
      let i = 0, y = takehome ? takehome.y + takehome.h / 2 - span / 2 : 0;
      i < data.split2.length;
      i++
    ) {
      s2.push({ ...data.split2[i], y, h: heights[i] });
      y += heights[i] + GAP2;
    }

    // Split 1 sources partition gross's right edge with no gaps.
    const r1: { key: string; d: string }[] = [];
    for (let i = 0, sy = 0; i < s1.length; i++) {
      const n = s1[i];
      const b = sy + n.value * scale;
      r1.push({ key: n.key, d: ribbon(X0R, sy, b, X1L, n.y, n.y + n.h) });
      sy = b;
    }

    // Split 2 sources partition take-home's own edge.
    const r2: { key: string; d: string }[] = [];
    for (let i = 0, sy = takehome?.y ?? 0; i < s2.length; i++) {
      const n = s2[i];
      const b = sy + n.h;
      r2.push({ key: n.key, d: ribbon(X1R, sy, b, X2L, n.y, n.y + n.h) });
      sy = b;
    }

    return { s1, s2, r1, r2, takehome };
  }, [data]);

  const takeHomeValue = layout.takehome?.value ?? 0;
  const paths = data.split1.length + data.split2.length;

  const opacityFor = (key: string) =>
    hover === null ? 0.22 : hover === key ? 0.5 : 0.07;

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: W, height: BOX_H }}>
        <svg
          width={W}
          height={BOX_H}
          className="absolute inset-0"
          aria-hidden
          focusable="false"
        >
          {[...layout.r1, ...layout.r2].map((r, i) => (
            <path
              key={`${r.key}-${i}`}
              d={r.d}
              fill={COLORS[r.key] ?? "#3b4250"}
              opacity={opacityFor(r.key)}
              style={{ transition: "opacity 120ms ease-out" }}
            />
          ))}
        </svg>

        {/* Column 0 — gross */}
        <div
          className="absolute rounded-lg"
          style={{
            left: 0,
            top: 0,
            width: X0R,
            height: H,
            background: "#151a26",
            border: "1px solid #2f3a52",
            borderLeft: "3px solid #5b8cff",
          }}
        >
          <div className="p-4">
            <div className="font-mono text-eyebrow uppercase text-muted">
              Gross pay
            </div>
            <div className="mt-2 text-section font-semibold tabular-nums text-fg">
              {currency(data.gross)}
            </div>
            <div className="mt-1 font-mono text-micro text-accent">100.0%</div>
            <p className="mt-3 text-caption text-muted">
              Paid {weekdayDate(data.period_start)}.
            </p>
            {takeHomeValue > 0 && data.gross > 0 && (
              <p className="mt-4 border-t border-line pt-3 text-caption text-muted">
                {share(100 - (takeHomeValue / data.gross) * 100, 0)} of every
                dollar never reaches your checking account.
              </p>
            )}
          </div>
        </div>

        {/* Column 1 — split 1 */}
        {layout.s1.map((n) => {
          const style = CARD_STYLE[n.key] ?? { bg: "#181c22", border: "#2a303a" };
          const pct = data.gross > 0 ? (n.value / data.gross) * 100 : 0;
          return (
            <div
              key={n.key}
              className="absolute overflow-hidden rounded-lg"
              onMouseEnter={() => setHover(n.key)}
              onMouseLeave={() => setHover(null)}
              style={{
                left: X1L,
                top: n.y,
                width: CARD_W,
                height: Math.max(n.h, 22),
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderLeft: `3px solid ${COLORS[n.key] ?? "#8b93a7"}`,
              }}
            >
              <div className="px-3 py-2">
                <div className="truncate text-body font-medium text-fg">
                  {n.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-[15px] tabular-nums text-fg">
                    {currency(n.value, { cents: true })}
                  </span>
                  <span
                    className="font-mono text-micro"
                    style={{ color: COLORS[n.key] }}
                  >
                    {share(pct)}
                  </span>
                </div>
                {n.h > NOTE_MIN_H && n.detail && (
                  <p className="mt-2 text-caption text-muted">
                    {currency(n.detail.tax, { cents: true })} tax ·{" "}
                    {currency(n.detail.insurance, { cents: true })} insurance
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Column 2 — terminal nodes */}
        {layout.s2.map((n) => {
          const delta = n.avg !== undefined ? n.value - n.avg : null;
          // Polarity inverts for "kept": more than average is good there,
          // where more than average is bad everywhere else.
          const tone =
            delta === null || Math.abs(delta) < 0.5
              ? "text-muted"
              : n.key === "kept"
                ? delta > 0
                  ? "text-good"
                  : "text-warn"
                : delta > 0
                  ? "text-bad"
                  : "text-good";
          const pct = takeHomeValue > 0 ? (n.value / takeHomeValue) * 100 : 0;
          return (
            <div
              key={n.key}
              className="absolute"
              onMouseEnter={() => setHover(n.key)}
              onMouseLeave={() => setHover(null)}
              style={{ left: X2L, top: n.y, width: LABEL_W, height: Math.max(n.h, 18) }}
            >
              <div
                className="absolute left-0 top-0 rounded-full"
                style={{
                  width: BAR_W,
                  height: Math.max(n.h, 4),
                  background: COLORS[n.key] ?? "#3b4250",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: 22,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: LABEL_W - 22,
                }}
              >
                <div className="truncate text-body font-medium text-fg">
                  {n.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-[14px] tabular-nums text-fg">
                    {currency(n.value, { cents: true })}
                  </span>
                  <span className="font-mono text-micro text-muted">
                    {share(pct)} of take-home
                  </span>
                </div>
                {delta !== null && (
                  <div className={`mt-0.5 font-mono text-micro ${tone}`}>
                    {Math.abs(delta) < 0.5
                      ? "on average"
                      : `${signedCurrency(delta)} vs avg`}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Column captions */}
        <div
          className="absolute font-mono text-eyebrow uppercase text-dim"
          style={{ top: 782, left: 0, width: X1L }}
        >
          Gross
        </div>
        <div
          className="absolute font-mono text-eyebrow uppercase text-dim"
          style={{ top: 782, left: X1L, width: 480 }}
        >
          Split 1 — withheld vs take-home
        </div>
        <div
          className="absolute font-mono text-eyebrow uppercase text-dim"
          style={{ top: 782, left: X2L }}
        >
          Split 2 — vs 6-period avg
        </div>
      </div>

      <p className="sr-only">
        {paths} paths. Split one totals {currency(data.gross)} gross. Split two
        totals {currency(takeHomeValue)} take-home.
      </p>
    </div>
  );
}

/** Header caption. Counted rather than hardcoded, since an unclassified node
 *  appears only when excluded-category spending exists. */
export function FlowClaim({ data }: { data: FlowData }) {
  const paths = data.split1.length + data.split2.length;
  return (
    <span className="font-mono text-eyebrow uppercase text-dim">
      Two splits · {paths} paths · nothing unaccounted for
    </span>
  );
}
