/**
 * Calibration and power of the luck test, and of the deflated Sharpe ratio as
 * used on the Command Centre. A test that cries "skill" on random data, or
 * never fires on data with a real edge, is worse than no test.
 */

import { describe, expect, it } from "vitest";
import { rankableKinds } from "@/lib/home/best";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import type { StrategyConfig } from "@/lib/strategies/schema";
import { runBacktest, windowCandles } from "./backtest";
import { luckTest, replayReturns } from "./luck";
import { perBarSharpe } from "./stats";
import { makeGaussian, mulberry32 } from "./prng";
import type { Candle, CandleSeries } from "./types";

function series(seed: number, kind: "random_walk" | "trending", bars = 1000): CandleSeries {
  const u = mulberry32(seed);
  const g = makeGaussian(u);
  const candles: Candle[] = [];
  let price = 100;
  let drift = 0.002;
  for (let i = 0; i < bars; i++) {
    // A planted edge: drift regimes lasting about 150 days, long enough for 20 to 100-bar trend rules to
    // harvest. (Regimes near the slow average's length are not harvestable: every rule enters late and exits late.)
    if (kind === "trending" && u() < 1 / 150) drift = -drift;
    const r = kind === "trending" ? drift + 0.01 * g() : 0.0003 + 0.012 * g();
    const open = price;
    const close = open * Math.exp(r);
    candles.push({ time: Date.UTC(2020, 0, 1) + i * 86_400_000, open, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996, close, volume: 1 });
    price = close;
  }
  return { asset: "CRYPTO:BTC", market: "CRYPTO", currency: "USD", timeframe: "1d", candles, source: { provider: "demo", version: "test", label: "TEST", isSynthetic: true, freshness: "simulated", adjustment: "none", asOf: null } };
}

function pValueFor(s: CandleSeries, simulations = 400): number {
  const start = s.candles[200].time;
  const results = rankableKinds().map((k) => {
    const cfg: StrategyConfig = { ...STRATEGY_LIBRARY[k].defaults, assets: [s.asset], costs: { feeBps: 5, slippageBps: 5, feeFixed: 0 } };
    return runBacktest(cfg, [s], { start });
  });
  return luckTest({ results, candles: windowCandles(s, results[0]), simulations, seed: 1 })!.pValue;
}

describe("luck test", () => {
  it("is calibrated: on random walks, p below 0.10 about 10% of the time", () => {
    const ps = Array.from({ length: 60 }, (_, i) => pValueFor(series(1000 + i, "random_walk")));
    const below10 = ps.filter((p) => p < 0.1).length / ps.length;
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    // Binomial standard error at n = 60 is about 0.04, so allow roughly three of them.
    expect(below10).toBeLessThan(0.22);
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });

  // Power depends on how many independent moves the window holds. Measured on this planted edge: about
  // 2 years of daily bars detects it 0 times in 15, about 5 years 2 in 15, about 11 years 14 in 15.
  // Two years cannot separate a real trend edge from lucky timing, which is why the Command Centre
  // judges the winner on all history before the paper-trading holdout.
  it("has power with enough history: on 11 years with a planted, harvestable trend, it usually fires", () => {
    const ps = Array.from({ length: 12 }, (_, i) => pValueFor(series(7000 + i, "trending", 3000), 300));
    const fired = ps.filter((p) => p < 0.1).length / ps.length;
    expect(fired).toBeGreaterThan(0.6);
  });

  it("positive control is genuine: trend rules profit on the planted series and lose nothing to luck on average", () => {
    const s = series(5003, "trending");
    const start = s.candles[200].time;
    const trend = runBacktest({ ...STRATEGY_LIBRARY.trend_following.defaults, assets: [s.asset], costs: { feeBps: 5, slippageBps: 5, feeFixed: 0 } }, [s], { start });
    expect(trend.metrics.sharpe!).toBeGreaterThan(0.5);
  });
});

describe("replay", () => {
  it("the one-pass Sharpe inside the luck test matches the readable replay", () => {
    const s = series(42, "random_walk", 400);
    const r = runBacktest({ ...STRATEGY_LIBRARY.ma_crossover.defaults, assets: [s.asset], costs: { feeBps: 5, slippageBps: 5, feeFixed: 0 } }, [s], { start: s.candles[100].time });
    const candles = windowCandles(s, r);
    const exposure = r.equity.map((p) => p.exposure);
    const expected = perBarSharpe(replayReturns(candles.map((c) => c.close), exposure, 0.001));
    const t = luckTest({ results: [r], candles, simulations: 10 })!;
    // With one strategy and its assumptions (5 + 5 bp, no flat fee), costRate is exactly 0.001.
    expect(t.observedBest).toBeCloseTo(expected, 10);
  });
});
