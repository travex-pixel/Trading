import { describe, expect, it } from "vitest";
import { annualisedSharpe, cagr, computeMetrics, maxConsecutiveLosses, maxDrawdown, stdDev } from "./metrics";
import type { EquityPoint, Trade } from "./types";

function eq(values: number[], stepMs = 86_400_000): EquityPoint[] {
  return values.map((v, i) => ({ time: Date.UTC(2024, 0, 1) + i * stepMs, equity: v, cash: 0, exposure: 1, drawdown: 0 }));
}

describe("maxDrawdown", () => {
  it("measures the largest peak-to-trough fall", () => {
    const d = maxDrawdown(eq([100, 120, 90, 95, 130, 100, 140]));
    // Peaks: 120 -> trough 90 = 25%; 130 -> 100 = 23%. Max 25%.
    expect(d.maxDrawdownPct).toBeCloseTo(25, 8);
    expect(d.peakIndex).toBe(1);
    expect(d.troughIndex).toBe(2);
    expect(d.durationBars).toBe(1);
  });
  it("is zero for a rising curve", () => {
    expect(maxDrawdown(eq([1, 2, 3])).maxDrawdownPct).toBe(0);
  });
  it("handles an empty curve", () => {
    expect(maxDrawdown([]).maxDrawdownPct).toBe(0);
  });
});

describe("sharpe", () => {
  it("is null with too few returns or zero variance", () => {
    expect(annualisedSharpe([0.01, 0.02], 365)).toBeNull();
    expect(annualisedSharpe(Array(40).fill(0.01), 365)).toBeNull();
  });
  it("annualises by the square root of bars per year", () => {
    const r = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.005));
    const s = annualisedSharpe(r, 365) as number;
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    expect(s).toBeCloseTo((m / stdDev(r)) * Math.sqrt(365), 10);
  });
});

describe("cagr", () => {
  it("is null for short periods and correct for a two-year double", () => {
    expect(cagr(100, 200, 0, 30 * 86_400_000)).toBeNull();
    const twoYears = 2 * 365.25 * 86_400_000;
    expect(cagr(100, 400, 0, twoYears)).toBeCloseTo(100, 6);
  });
});

describe("computeMetrics", () => {
  const trade = (pnl: number, returnPct: number): Trade => ({
    id: 1,
    asset: "BTC",
    entryIndex: 0,
    entryTime: 0,
    entryPrice: 100,
    quantity: 1,
    exitIndex: 1,
    exitTime: 1,
    exitPrice: 100 + pnl,
    exitReason: "signal",
    fees: 0.1,
    entryFees: 0.05,
    pnl,
    returnPct,
    holdingBars: 1,
    entryReason: "",
    exitReasonText: "",
  });

  it("flags insufficient trades and computes win rate and profit factor", () => {
    const { metrics, warnings } = computeMetrics(eq([1000, 1010, 1005, 1020]), [trade(10, 0.1), trade(-5, -0.05), trade(15, 0.15)], 365, 1000);
    expect(metrics.tradeCount).toBe(3);
    expect(metrics.winRatePct).toBeCloseTo(66.6667, 3);
    expect(metrics.profitFactor).toBeCloseTo(5, 8);
    expect(metrics.totalReturnPct).toBeCloseTo(2, 8);
    expect(warnings.some((w) => w.code === "insufficient_trades")).toBe(true);
    expect(warnings.some((w) => w.code === "annualisation_unreliable")).toBe(true);
    expect(metrics.cagrPct).toBeNull();
  });

  it("returns infinite profit factor with no losing trades and null with no trades", () => {
    expect(computeMetrics(eq([1000, 1100]), [trade(100, 0.1)], 365, 1000).metrics.profitFactor).toBe(Infinity);
    expect(computeMetrics(eq([1000, 1000]), [], 365, 1000).metrics.profitFactor).toBeNull();
  });

  it("counts losing streaks", () => {
    expect(maxConsecutiveLosses([trade(1, 0), trade(-1, 0), trade(-1, 0), trade(1, 0), trade(-1, 0)])).toBe(2);
  });
});
