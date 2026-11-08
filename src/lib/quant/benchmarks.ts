/**
 * Benchmarks every strategy is compared against: buy and hold, cash, and a
 * naive time-series momentum rule. All run with the same capital, period,
 * costs and execution assumptions as the strategy under test.
 */

import type { StrategyConfig } from "@/lib/strategies/schema";
import { runBacktest, type BacktestOptions } from "./backtest";
import type { BacktestResult, CandleSeries, EquityPoint } from "./types";
import { computeMetrics } from "./metrics";

export interface BenchmarkSet {
  buyAndHold: BacktestResult;
  cash: BacktestResult;
  momentum: BacktestResult;
}

export function buyAndHoldConfig(config: StrategyConfig): StrategyConfig {
  return {
    ...config,
    name: "Buy and hold",
    assets: [config.assets[0]],
    params: { kind: "buy_and_hold" },
    risk: { stopLossPct: null, takeProfitPct: null, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 },
  };
}

export function momentumBenchmarkConfig(config: StrategyConfig): StrategyConfig {
  // A 90-day lookback at each timeframe (capped by the schema at 1000 bars).
  const lookback = config.timeframe === "1d" ? 90 : config.timeframe === "4h" ? 540 : 1000;
  return {
    ...config,
    name: "Simple momentum",
    assets: [config.assets[0]],
    params: { kind: "tsmom", lookback },
    risk: { stopLossPct: null, takeProfitPct: null, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 },
  };
}

/** A zero-return cash baseline over the same bars as `reference`. */
export function cashBenchmark(reference: BacktestResult): BacktestResult {
  const equity: EquityPoint[] = reference.equity.map((p) => ({
    time: p.time,
    equity: reference.assumptions.initialCapital,
    cash: reference.assumptions.initialCapital,
    exposure: 0,
    drawdown: 0,
  }));
  const { metrics } = computeMetrics(equity, [], reference.timeframe, reference.assumptions.initialCapital);
  return {
    ...reference,
    id: `${reference.id}-cash`,
    strategyId: "cash",
    strategyName: "Cash",
    equity,
    trades: [],
    signals: [],
    indicators: {},
    metrics,
    warnings: [],
  };
}

export function runBenchmarks(config: StrategyConfig, series: CandleSeries[], options: BacktestOptions, reference: BacktestResult): BenchmarkSet {
  const window = { start: reference.period.start, end: reference.period.end, ...options };
  const buyAndHold = runBacktest(buyAndHoldConfig(config), series, { start: reference.period.start, end: reference.period.end, label: window.label });
  const momentum = runBacktest(momentumBenchmarkConfig(config), series, { start: reference.period.start, end: reference.period.end });
  return { buyAndHold, cash: cashBenchmark(reference), momentum };
}
