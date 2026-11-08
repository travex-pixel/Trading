/**
 * Turning a Lab run into a journal entry, and related helpers.
 */

import type { LabRun } from "@/lib/lab/run";
import { newId } from "@/lib/store/local-store";
import type { Experiment } from "@/lib/store/types";
import { downsample } from "@/lib/utils";
import type { StrategyConfig } from "@/lib/strategies/schema";

export function experimentFromRun(
  run: LabRun,
  input: { hypothesis: string; findings: string; weaknesses: string; lineageId?: string; version?: number },
): Experiment {
  const r = run.result;
  return {
    id: newId("exp"),
    lineageId: input.lineageId ?? newId("lin"),
    version: input.version ?? 1,
    name: run.config.name,
    hypothesis: input.hypothesis.trim(),
    config: run.config,
    dataset: { provider: r.source.provider, version: r.source.version, label: r.source.label, isSynthetic: r.source.isSynthetic },
    period: r.period,
    timeframe: r.timeframe,
    assets: r.assets,
    result: {
      metrics: r.metrics,
      benchmark: { name: "Buy and hold", metrics: run.benchmarks.buyAndHold.metrics },
      verdict: run.assessment.verdict,
      equity: downsample(r.equity, 240).map((p) => ({ time: p.time, equity: p.equity })),
      warnings: run.assessment.findings.filter((f) => f.severity !== "good").map((f) => f.title),
    },
    findings: input.findings.trim(),
    weaknesses: input.weaknesses.trim(),
    createdAt: Date.now(),
  };
}

/** Whether two configs are the same idea (same kind and assets), for versioning. */
export function sameLineage(a: StrategyConfig, b: StrategyConfig): boolean {
  return a.params.kind === b.params.kind && a.assets.join() === b.assets.join();
}

/** Auto-generated weakness notes from the assessment, as a starting point the user can edit. */
export function suggestedWeaknesses(run: LabRun): string {
  return run.assessment.findings
    .filter((f) => f.severity === "warning" || f.severity === "critical")
    .map((f) => `• ${f.title}: ${f.detail}`)
    .join("\n");
}

export function suggestedFindings(run: LabRun): string {
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const lines = [
    `Returned ${sign(m.totalReturnPct)}% with a ${m.maxDrawdownPct.toFixed(1)}% maximum drawdown over ${m.tradeCount} trades.`,
    `Buy and hold returned ${sign(b.totalReturnPct)}% with a ${b.maxDrawdownPct.toFixed(1)}% drawdown.`,
  ];
  if (m.sharpe !== null && b.sharpe !== null) lines.push(`Sharpe ${m.sharpe.toFixed(2)} vs ${b.sharpe.toFixed(2)} for buy and hold.`);
  lines.push(run.assessment.headline);
  return lines.join(" ");
}

function sign(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}
