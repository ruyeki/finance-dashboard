"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";
import SankeyChart from "@/components/charts/SankeyChart";
import { api } from "@/lib/api";
import { SankeyData } from "@/lib/types";

export default function FlowPage() {
  const [data, setData] = useState<SankeyData | null>(null);

  useEffect(() => {
    api<SankeyData>("/metrics/sankey").then(setData).catch(() => {});
  }, []);

  return (
    <Shell>
      <PageHeader
        title="Money Flow"
        subtitle="Where your paycheck goes this pay period"
      />
      <Card>
        {data ? (
          <SankeyChart data={data} />
        ) : (
          <div className="flex h-64 items-center justify-center text-muted">
            Loading…
          </div>
        )}
      </Card>
    </Shell>
  );
}
