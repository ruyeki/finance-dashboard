"use client";

import { Sankey } from "@visx/sankey";
import { SankeyData } from "@/lib/types";
import { colorFor, currency } from "@/lib/format";

const WIDTH = 920;

export default function SankeyChart({ data }: { data: SankeyData }) {
  if (!data.nodes.length || !data.links.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Add a paycheck and some transactions to see your money flow.
      </div>
    );
  }

  const height = Math.max(320, data.nodes.length * 34);

  // d3-sankey mutates its input, so pass fresh copies each render.
  const root = {
    nodes: data.nodes.map((n) => ({ ...n })),
    links: data.links.map((l) => ({ ...l })),
  };

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: "100%" }}
    >
      <Sankey<{ name: string }, Record<string, never>>
        root={root as never}
        size={[WIDTH, height]}
        nodeWidth={14}
        nodePadding={16}
        extent={[
          [1, 8],
          [WIDTH - 1, height - 8],
        ]}
      >
        {({ graph, createPath }) => (
          <g>
            {graph.links.map((link, i) => (
              <path
                key={`link-${i}`}
                d={createPath(link) ?? ""}
                stroke={colorFor((link.target as { index: number }).index)}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={0.28}
                fill="none"
              />
            ))}
            {graph.nodes.map((node, i) => {
              const x0 = node.x0 ?? 0;
              const x1 = node.x1 ?? 0;
              const y0 = node.y0 ?? 0;
              const y1 = node.y1 ?? 0;
              const leftHalf = x0 < WIDTH / 2;
              return (
                <g key={`node-${i}`}>
                  <rect
                    x={x0}
                    y={y0}
                    width={x1 - x0}
                    height={Math.max(1, y1 - y0)}
                    fill={colorFor(i)}
                    rx={2}
                  />
                  <text
                    x={leftHalf ? x1 + 6 : x0 - 6}
                    y={(y0 + y1) / 2}
                    textAnchor={leftHalf ? "start" : "end"}
                    dominantBaseline="middle"
                    fontSize={12}
                    fill="#e5e7eb"
                  >
                    {(node as { name: string }).name}
                    <tspan fill="#8b93a7">
                      {"  "}
                      {currency(node.value ?? 0)}
                    </tspan>
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </Sankey>
    </svg>
  );
}
