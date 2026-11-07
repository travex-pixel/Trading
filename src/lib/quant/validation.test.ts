import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { runBacktest } from "./backtest";
import { runBenchmarks } from "./benchmarks";
import { assessEdge, classifyRegimes, neighbourhood, parameterGrid, regimePerformance, sensitivity, splitPeriod, walkForward } from "./validation";

const btc = demoSeries("BTC", "1d");
const period = { start: btc.candles[200].time, end: btc.candles[btc.candles.length - 1].time };

describe("splitPeriod", () => {
  it("splits in time order without overlap", () => {
    const s = splitPeriod(0, 1000, [0.6, 0.2, 0.2]);
    expect(s.train.start).toBe(0);
    expect(s.train.end).toBeLessThan(s.validation.start);
    expect(s.validation.end).toBeLessThan(s.test.start);
    expect(s.test.end).toBe(1000);
  });
});

describe("parameter grids", () => {
  it("builds a neighbourhood around a value inside bounds", () => {
    const n = neighbourhood({ key: "fast", value: 20, min: 2, max: 200, step: 1, integer: true });
    expect(n).toContain(20);
    expect(n[0]).toBeGreaterThanOrEqual(2);
    expect(n[n.length - 1]).toBeLessThanOrEqual(200);
  });
  it("drops invalid combinations such as fast >= slow", () => {
    const grid = parameterGrid(STRATEGY_LIBRARY.ma_crossover.defaults, 50);
    for (const g of grid) {
      if (g.params.kind === "ma_crossover") expect(g.params.fast).toBeLessThan(g.params.slow);
    }
    expect(grid.length).toBeGreaterThan(1);
  });
});

describe("walkForward", () => {
  it("re-optimises on each training window and stitches out-of-sample equity", () => {
    const cfg = { ...STRATEGY_LIBRARY.ma_crossover.defaults, timeframe: "1d" as const };
    const report = walkForward(cfg, [btc], period, { folds: 3, maxEvaluationsPerFold: 9 });
    expect(report.folds.length).toBe(3);
    for (const f of report.folds) {
      expect(f.train.end).toBeLessThan(f.test.start);
      expect(f.test.start).toBeGreaterThan(f.train.start);
    }
    expect(report.stitchedEquity.length).toBeGreaterThan(100);
    expect(report.stitchedEquity[0].equity).toBeCloseTo(cfg.initialCapital, 6);
    // Stitched curve is continuous: the first point of each fold equals the last of the previous.
    let idx = 0;
    for (let i = 0; i < report.folds.length - 1; i++) {
      idx += report.folds[i].testResult.equity.length;
      const prev = report.stitchedEquity[idx - 1].equity;
      const next = report.stitchedEquity[idx].equity;
      expect(next).toBeCloseTo(prev, 6);
    }
  });
});

describe("sensitivity and regimes", () => {
  it("evaluates neighbouring parameters and reports stability in 0..1", () => {
    const cfg = { ...STRATEGY_LIBRARY.tsmom.defaults, timeframe: "1d" as const, params: { kind: "tsmom" as const, lookback: 60 } };
    const reports = sensitivity(cfg, [btc], period);
    expect(reports).toHaveLength(1);
    expect(reports[0].points.length).toBeGreaterThan(3);
    expect(reports[0].stability).toBeGreaterThanOrEqual(0);
    expect(reports[0].stability).toBeLessThanOrEqual(1);
  });

  it("classifies regimes causally and attributes performance", () => {
    const regimes = classifyRegimes(btc);
    expect(regimes.slice(0, 50).every((r) => r === null)).toBe(true);
    expect(new Set(regimes.filter(Boolean)).size).toBeGreaterThanOrEqual(2);
    const cfg = { ...STRATEGY_LIBRARY.buy_and_hold.defaults, timeframe: "1d" as const };
    const result = runBacktest(cfg, [btc], period);
    const perf = regimePerformance(result, btc);
    const share = perf.reduce((s, p) => s + p.sharePct, 0);
    expect(share).toBeCloseTo(100, 3);
    // Buy and hold tracks the market inside each regime (up to the single entry bar).
    for (const p of perf) expect(Math.abs(p.strategyReturnPct - p.marketReturnPct)).toBeLessThan(5);
  });
});

describe("assessEdge", () => {
  it("calls buy and hold unproven against itself and flags no-trade strategies", () => {
    const cfg = { ...STRATEGY_LIBRARY.breakout.defaults, timeframe: "1d" as const, params: { kind: "breakout" as const, lookback: 400, exitLookback: 400 } };
    const short = { start: btc.candles[400].time, end: btc.candles[450].time };
    const result = runBacktest(cfg, [btc], short);
    const bench = runBenchmarks(cfg, [btc], short, result);
    const assessment = assessEdge({ result, benchmark: bench.buyAndHold, walkForward: null, sensitivity: [], regimes: [], timeframe: "1d" });
    expect(["unproven", "fragile"]).toContain(assessment.verdict);
    expect(assessment.findings.length).toBeGreaterThan(0);
  });
});
