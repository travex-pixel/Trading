import { describe, expect, it } from "vitest";
import { deflatedSharpe, expectedMaxSharpe, moments, normalCdf, normalInv, probabilisticSharpe } from "./stats";

describe("normal distribution", () => {
  it("matches standard table values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-1.644854)).toBeCloseTo(0.05, 6);
    expect(normalInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalInv(0.01)).toBeCloseTo(-2.326348, 5);
    expect(normalInv(0.999)).toBeCloseTo(3.090232, 5);
  });
  it("round-trips", () => {
    for (const p of [0.001, 0.02, 0.2, 0.5, 0.7, 0.98, 0.9995]) expect(normalCdf(normalInv(p))).toBeCloseTo(p, 6);
  });
});

describe("moments", () => {
  it("gives skew 0 and kurtosis 1 for a symmetric two-point distribution", () => {
    const m = moments([1, -1, 1, -1, 1, -1]);
    expect(m.mean).toBeCloseTo(0, 12);
    expect(m.skew).toBeCloseTo(0, 12);
    expect(m.kurtosis).toBeCloseTo(1, 12);
  });
});

describe("deflated Sharpe ratio", () => {
  // Worked example in Bailey and López de Prado (2014): 100 trials, variance of
  // annualised Sharpe across trials 0.5, five years of daily returns (1,250),
  // skew -3, kurtosis 10, best annualised Sharpe 2.5. Expected max Sharpe
  // about 0.1132 per day, deflated Sharpe 0.9004.
  it("reproduces the paper's example", () => {
    const perDay = (annual: number) => annual / Math.sqrt(250);
    const variancePerDay = 0.5 / 250;
    const em = expectedMaxSharpe(100, variancePerDay);
    expect(em).toBeCloseTo(0.1132, 3);
    const { dsr } = deflatedSharpe({ observed: perDay(2.5), trials: 100, sharpeVariance: variancePerDay, bars: 1250, skew: -3, kurtosis: 10 });
    expect(dsr).toBeCloseTo(0.9004, 3);
  });

  it("is lower when more strategies were tried", () => {
    const base = { observed: 0.08, sharpeVariance: 0.002, bars: 500, skew: 0, kurtosis: 3 };
    const few = deflatedSharpe({ ...base, trials: 2 }).dsr;
    const many = deflatedSharpe({ ...base, trials: 50 }).dsr;
    expect(many).toBeLessThan(few);
  });

  it("collapses to the probabilistic Sharpe ratio against zero for a single trial", () => {
    expect(deflatedSharpe({ observed: 0.05, trials: 1, sharpeVariance: 0.01, bars: 400, skew: 0, kurtosis: 3 }).dsr).toBeCloseTo(probabilisticSharpe(0.05, 0, 400, 0, 3), 12);
  });
});
