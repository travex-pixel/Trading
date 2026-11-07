/**
 * The Lab's orchestration: run a strategy with its benchmarks and, when asked,
 * the full validation suite. Pure functions over candles; callable from the
 * browser (interactive) or the server.
 */

import { runBacktest } from "@/lib/quant/backtest";
import { runBenchmarks, type BenchmarkSet } from "@/lib/quant/benchmarks";
import type { BacktestResult, CandleSeries } from "@/lib/quant/types";
import {
  assessEdge,
  regimePerformance,
  sensitivity,
  walkForward,
  type EdgeAssessment,
  type Period,
  type RegimePerformance,
  type SensitivityReport,
  type WalkForwardReport,
} from "@/lib/quant/validation";
import type { StrategyConfig } from "@/lib/strategies/schema";

export interface LabRun {
  config: StrategyConfig;
  period: Period;
  result: BacktestResult;
  benchmarks: BenchmarkSet;
  regimes: RegimePerformance[];
  validation: {
    walkForward: WalkForwardReport | null;
    sensitivity: SensitivityReport[];
  } | null;
  assessment: EdgeAssessment;
  /** Milliseconds the whole run took. */
  elapsedMs: number;
}

export interface RunOptions {
  /** Run walk-forward and sensitivity (slower). */
  validate?: boolean;
  folds?: number;
}

export function runLab(config: StrategyConfig, series: CandleSeries[], period: Period, options: RunOptions = {}): LabRun {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const result = runBacktest(config, series, period);
  const benchmarks = runBenchmarks(config, series, {}, result);
  const primary = series.find((s) => s.asset === config.assets[0]) ?? series[0];
  const regimes = regimePerformance(result, primary);

  let validation: LabRun["validation"] = null;
  if (options.validate) {
    const tunable = config.params.kind !== "buy_and_hold" && config.params.kind !== "random_baseline";
    const wf = tunable ? walkForward(config, series, { start: result.period.start, end: result.period.end }, { folds: options.folds ?? 4 }) : null;
    const sens = tunable ? sensitivity(config, series, { start: result.period.start, end: result.period.end }) : [];
    validation = { walkForward: wf, sensitivity: sens };
  }

  const assessment = assessEdge({
    result,
    benchmark: benchmarks.buyAndHold,
    walkForward: validation?.walkForward ?? null,
    sensitivity: validation?.sensitivity ?? [],
    regimes,
    timeframe: config.timeframe,
  });
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { config, period, result, benchmarks, regimes, validation, assessment, elapsedMs: t1 - t0 };
}

/** Default analysis period: the last two years of the available data. */
export function defaultPeriod(series: CandleSeries[]): Period {
  const ref = series[0];
  const end = ref.candles[ref.candles.length - 1].time;
  const start = Math.max(ref.candles[0].time, end - 2 * 365 * 86_400_000);
  return { start, end };
}

/** Risk-adjusted score used to rank strategies: Sharpe when available, else return / drawdown. */
export function riskAdjustedScore(r: BacktestResult): number | null {
  const m = r.metrics;
  if (m.tradeCount === 0 && m.exposurePct === 0) return null;
  if (m.sharpe !== null) return m.sharpe;
  if (m.maxDrawdownPct > 0) return m.totalReturnPct / m.maxDrawdownPct;
  return null;
}
