/**
 * Property tests for the engine. These do not check particular numbers, they
 * check rules that must hold for every strategy on every dataset:
 *
 * 1. No look-ahead. Replace every bar after a cut with different prices. If
 *    any signal, fill or equity value at or before the cut changes, some part
 *    of the engine or an indicator read the future.
 * 2. Accounting. Cash never goes negative, equity is cash plus positions, and
 *    the money made on trades equals the change in the account.
 */

import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";
import { runBacktest } from "./backtest";
import { mulberry32 } from "./prng";
import type { Candle, CandleSeries } from "./types";

/** Keep bars 0..cut, then continue with an unrelated random walk from the cut's close. */
function perturbAfter(
  series: CandleSeries,
  cut: number,
  seed: number,
): CandleSeries {
  const rng = mulberry32(seed);
  const gauss = () =>
    Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const out: Candle[] = series.candles.slice(0, cut + 1);
  let prev = out[cut].close;
  for (let i = cut + 1; i < series.candles.length; i++) {
    const open = prev * Math.exp(0.01 * gauss());
    const close = open * Math.exp(0.02 * gauss());
    const high = Math.max(open, close) * (1 + 0.01 * rng());
    const low = Math.min(open, close) * (1 - 0.01 * rng());
    out.push({
      time: series.candles[i].time,
      open,
      high,
      low,
      close,
      volume: 1,
    });
    prev = close;
  }
  return { ...series, candles: out };
}

/** Each library strategy on its own default instruments, with real-world costs and protective exits switched on. */
function configFor(kind: StrategyKind): StrategyConfig {
  const d = STRATEGY_LIBRARY[kind].defaults;
  return {
    ...d,
    risk: { ...d.risk, stopLossPct: 0.08, takeProfitPct: 0.25 },
    costs: { feeBps: 5, slippageBps: 5, feeFixed: 10 },
  };
}

const KINDS = STRATEGY_ORDER;

describe("engine property: no look-ahead", () => {
  for (const kind of KINDS) {
    it(`${kind}: nothing at or before the cut depends on later bars`, () => {
      const config = configFor(kind);
      const original = config.assets.map((a) => demoSeries(a, "1d"));
      const n = original[0].candles.length;
      for (const cut of [
        Math.floor(n * 0.35),
        Math.floor(n * 0.6),
        Math.floor(n * 0.85),
      ]) {
        const perturbed = original.map((s, k) =>
          perturbAfter(s, cut, 1000 + k + cut),
        );
        const a = runBacktest(config, original);
        const b = runBacktest(config, perturbed);
        const cutTime = original[0].candles[cut].time;

        const eqA = a.equity.filter((p) => p.time <= cutTime);
        const eqB = b.equity.filter((p) => p.time <= cutTime);
        expect(eqB).toEqual(eqA);

        const sigA = a.signals.filter((s) => s.time <= cutTime);
        const sigB = b.signals.filter((s) => s.time <= cutTime);
        expect(sigB).toEqual(sigA);

        // Every trade that both entered and exited by the cut is identical.
        const doneA = a.trades.filter((t) => t.exitTime <= cutTime);
        const doneB = b.trades.filter((t) => t.exitTime <= cutTime);
        expect(doneB).toEqual(doneA);
      }
    });
  }
});

describe("engine property: accounting", () => {
  for (const kind of KINDS) {
    it(`${kind}: cash never negative, exposure in range, profit equals the change in the account`, () => {
      const config = configFor(kind);
      const series = config.assets.map((a) => demoSeries(a, "1d"));
      const r = runBacktest(config, series);
      for (const p of r.equity) {
        expect(p.cash).toBeGreaterThanOrEqual(-1e-9);
        expect(p.exposure).toBeGreaterThanOrEqual(0);
        expect(p.exposure).toBeLessThanOrEqual(1);
        expect(p.equity).toBeGreaterThan(0);
      }
      // Everything is closed at the end, so realised profit is the whole story.
      const realised = r.trades.reduce((s, t) => s + t.pnl, 0);
      const finalEquity = r.equity[r.equity.length - 1].equity;
      expect(finalEquity - config.initialCapital).toBeCloseTo(realised, 6);
      // Total return is the same number expressed as a percentage.
      expect(r.metrics.totalReturnPct).toBeCloseTo(
        ((finalEquity - config.initialCapital) / config.initialCapital) * 100,
        8,
      );
      // Fees reported on trades add up to the fee metric.
      const fees = r.trades.reduce((s, t) => s + t.fees, 0);
      expect(r.metrics.totalFees).toBeCloseTo(fees, 6);
    });
  }
});
