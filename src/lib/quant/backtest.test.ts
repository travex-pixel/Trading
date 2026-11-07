import { describe, expect, it } from "vitest";
import type { StrategyConfig } from "@/lib/strategies/schema";
import { runBacktest, BacktestError } from "./backtest";
import type { Candle, CandleSeries, DataSource } from "./types";

const source: DataSource = { provider: "demo", version: "test", label: "TEST", isSynthetic: true };

function series(closes: number[], opens?: number[]): CandleSeries {
  const candles: Candle[] = closes.map((c, i) => {
    const o = opens ? opens[i] : i === 0 ? c : closes[i - 1];
    return { time: Date.UTC(2024, 0, 1) + i * 86_400_000, open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: c, volume: 1 };
  });
  return { asset: "BTC", timeframe: "1d", candles, source };
}

function cfg(partial: Partial<StrategyConfig> & { params: StrategyConfig["params"] }): StrategyConfig {
  return {
    v: 1,
    name: "test",
    assets: ["BTC"],
    timeframe: "1d",
    risk: { stopLossPct: null, takeProfitPct: null, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 },
    costs: { feeBps: 0, slippageBps: 0 },
    initialCapital: 1000,
    ...partial,
  };
}

describe("runBacktest: buy and hold", () => {
  it("buys at the second bar's open and tracks price exactly with zero costs", () => {
    const closes = [100, 100, 110, 121, 121];
    const s = series(closes);
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" } }), [s]);
    // Signal at bar 0 close, fill at bar 1 open (=100). Final close 121 -> +21%.
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].entryIndex).toBe(1);
    expect(r.trades[0].entryPrice).toBe(100);
    expect(r.trades[0].exitReason).toBe("end_of_data");
    expect(r.metrics.totalReturnPct).toBeCloseTo(21, 8);
    expect(r.equity[r.equity.length - 1].equity).toBeCloseTo(1210, 8);
  });

  it("charges fees and slippage on entry and exit", () => {
    const s = series([100, 100, 100, 100]);
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" }, costs: { feeBps: 100, slippageBps: 100 } }), [s]);
    // Buy fill 101, notional = cash / 1.01 ; fee 1% of notional. Exit at 100 close, fee 1%.
    const t = r.trades[0];
    expect(t.entryPrice).toBeCloseTo(101, 8);
    const notional = 1000 / 1.01;
    expect(t.quantity).toBeCloseTo(notional / 101, 8);
    const exitGross = t.quantity * 100;
    const expectedPnl = exitGross * 0.99 - notional - notional * 0.01;
    expect(t.pnl).toBeCloseTo(expectedPnl, 8);
    expect(r.metrics.totalReturnPct).toBeLessThan(0);
    expect(r.metrics.totalFees).toBeGreaterThan(0);
  });
});

describe("runBacktest: execution rules", () => {
  it("never fills on the bar that generated the signal (no look-ahead)", () => {
    const closes = [100, 200, 300, 400];
    const opens = [100, 150, 250, 350];
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" } }), [series(closes, opens)]);
    expect(r.trades[0].entryIndex).toBe(1);
    expect(r.trades[0].entryPrice).toBe(150);
  });

  it("fills a stop loss intrabar at the stop price, or the open if the bar gaps through", () => {
    // Enter at bar 1 open = 100. Bar 2 low = 100*0.99 ... we need a bigger drop.
    const candles: Candle[] = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 2, open: 98, high: 99, low: 80, close: 85, volume: 1 }, // stop 90 touched within the bar
      { time: 3, open: 85, high: 86, low: 84, close: 85, volume: 1 },
    ];
    const s: CandleSeries = { asset: "BTC", timeframe: "1d", candles, source };
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" }, risk: { stopLossPct: 0.1, takeProfitPct: null, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 } }), [s]);
    expect(r.trades[0].exitReason).toBe("stop_loss");
    expect(r.trades[0].exitPrice).toBeCloseTo(90, 8);
    expect(r.metrics.totalReturnPct).toBeCloseTo(-10, 8);

    const gap: CandleSeries = {
      asset: "BTC",
      timeframe: "1d",
      candles: [candles[0], candles[1], { time: 2, open: 70, high: 72, low: 65, close: 70, volume: 1 }, candles[3]],
      source,
    };
    const r2 = runBacktest(cfg({ params: { kind: "buy_and_hold" }, risk: { stopLossPct: 0.1, takeProfitPct: null, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 } }), [gap]);
    expect(r2.trades[0].exitPrice).toBeCloseTo(70, 8);
  });

  it("prefers the stop when a bar touches both stop and take-profit", () => {
    const candles: Candle[] = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 2, open: 100, high: 130, low: 80, close: 100, volume: 1 },
      { time: 3, open: 100, high: 101, low: 99, close: 100, volume: 1 },
    ];
    const s: CandleSeries = { asset: "BTC", timeframe: "1d", candles, source };
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" }, risk: { stopLossPct: 0.1, takeProfitPct: 0.1, sizing: { mode: "fixed_fraction", fraction: 1 }, maxPositions: 1 } }), [s]);
    expect(r.trades[0].exitReason).toBe("stop_loss");
  });

  it("scales a buy down to available cash and never goes negative", () => {
    const s = series([100, 100, 100]);
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" }, risk: { stopLossPct: null, takeProfitPct: null, sizing: { mode: "fixed_cash", amount: 1_000_000 }, maxPositions: 1 }, costs: { feeBps: 50, slippageBps: 0 } }), [s]);
    for (const p of r.equity) expect(p.cash).toBeGreaterThanOrEqual(-1e-9);
    expect(r.trades[0].quantity * 100 + r.trades[0].quantity * 100 * 0.005).toBeCloseTo(1000, 6);
  });
});

describe("runBacktest: strategies and edge cases", () => {
  it("reports zero trades and a warning when the rule never fires", () => {
    const s = series(Array.from({ length: 50 }, () => 100));
    const r = runBacktest(cfg({ params: { kind: "breakout", lookback: 10, exitLookback: 5 } }), [s]);
    expect(r.trades).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === "no_trades")).toBe(true);
    expect(r.metrics.sharpe).toBeNull();
  });

  it("MA crossover enters after the fast average crosses above the slow one", () => {
    const closes = [...Array.from({ length: 10 }, () => 100), ...Array.from({ length: 10 }, (_, i) => 100 + (i + 1) * 5)];
    const r = runBacktest(cfg({ params: { kind: "ma_crossover", fast: 2, slow: 5, maType: "sma" } }), [series(closes)]);
    expect(r.trades.length).toBeGreaterThanOrEqual(1);
    expect(r.trades[0].entryIndex).toBeGreaterThan(10);
    expect(r.signals.some((s) => s.note?.includes("crossed above"))).toBe(true);
  });

  it("rejects duplicate timestamps", () => {
    const s = series([100, 101, 102]);
    s.candles[1] = { ...s.candles[1], time: s.candles[0].time };
    expect(() => runBacktest(cfg({ params: { kind: "buy_and_hold" } }), [s])).toThrow(BacktestError);
  });

  it("rejects an empty dataset", () => {
    expect(() => runBacktest(cfg({ params: { kind: "buy_and_hold" } }), [series([])])).toThrow(BacktestError);
  });

  it("respects the requested period", () => {
    const s = series(Array.from({ length: 20 }, (_, i) => 100 + i));
    const start = s.candles[5].time;
    const end = s.candles[14].time;
    const r = runBacktest(cfg({ params: { kind: "buy_and_hold" } }), [s], { start, end });
    expect(r.period.start).toBe(start);
    expect(r.period.end).toBe(end);
    expect(r.equity).toHaveLength(10);
  });

  it("is deterministic", () => {
    const s = series(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 10));
    const c = cfg({ params: { kind: "random_baseline", seed: 42, flipProbability: 0.3 } });
    const a = runBacktest(c, [s]);
    const b = runBacktest(c, [s]);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.trades.length).toBeGreaterThan(0);
  });

  it("momentum rotation holds at most one asset and sells before buying", () => {
    const n = 60;
    const btc: CandleSeries = series(Array.from({ length: n }, (_, i) => 100 + i));
    const eth: CandleSeries = { ...series(Array.from({ length: n }, (_, i) => (i < 30 ? 100 + i * 3 : 190 - (i - 30) * 2))), asset: "ETH" };
    const r = runBacktest(
      cfg({ assets: ["BTC", "ETH"], params: { kind: "momentum_rotation", lookback: 5, rebalanceBars: 5, minReturn: 0 } }),
      [btc, eth],
    );
    expect(r.trades.length).toBeGreaterThan(1);
    expect(r.trades.some((t) => t.asset === "ETH")).toBe(true);
    expect(r.trades.some((t) => t.asset === "BTC")).toBe(true);
    for (const p of r.equity) expect(p.exposure).toBeLessThanOrEqual(1.0000001);
  });
});
