"use client";

import { useMemo } from "react";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { runLab } from "@/lib/lab/run";
import { useCandles } from "@/lib/market/client";
import type { Snapshot } from "@/lib/store/snapshot";
import { EquityPanel, MetricsTable, ResultHero, VerdictPanel } from "./results";

export function SharedExperiment({ snapshot }: { snapshot: Snapshot }) {
  const { series, error, loading } = useCandles(snapshot.config.assets, snapshot.config.timeframe);
  const run = useMemo(() => {
    if (!series) return null;
    try {
      return { run: runLab(snapshot.config, series, { start: snapshot.start, end: snapshot.end }), error: null };
    } catch (err) {
      return { run: null, error: err instanceof Error ? err.message : "Could not run." };
    }
  }, [series, snapshot]);

  if (error) return <ErrorState title="Market data unavailable" body={error} />;
  if (loading || !run) return <Skeleton className="h-96 w-full" />;
  if (run.error || !run.run) return <ErrorState title="This experiment cannot run on the current dataset" body={run.error} />;
  const r = run.run;
  const versionMismatch = r.result.source.version !== snapshot.data;
  return (
    <div className="space-y-5">
      {versionMismatch ? (
        <p className="rounded-[var(--radius-md)] border border-warn/40 bg-warn-dim px-3 py-2 text-xs text-warn">
          This link was created on dataset version {snapshot.data}; you are seeing it on {r.result.source.version}. Results may differ from what the sender saw.
        </p>
      ) : null}
      <ResultHero run={r} />
      <EquityPanel run={r} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <VerdictPanel run={r} />
        <Panel>
          <PanelHeader title="Metrics" />
          <PanelBody className="px-0 pt-0">
            <MetricsTable
              timeframe={r.config.timeframe}
              columns={[
                { name: "Strategy", metrics: r.result.metrics, color: "var(--series-1)" },
                { name: "Buy & hold", metrics: r.benchmarks.buyAndHold.metrics },
              ]}
              compactRows={["totalReturnPct", "cagrPct", "maxDrawdownPct", "sharpe", "tradeCount", "winRatePct", "profitFactor", "exposurePct", "totalFees"]}
            />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
