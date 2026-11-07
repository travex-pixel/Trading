import { describe, expect, it } from "vitest";
import { atr, donchian, ema, macd, rollingStd, rsi, simpleReturns, sma, trailingReturn } from "./indicators";
import type { Candle } from "./types";

function candlesFrom(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: i * 3_600_000, open: c, high: c + 1, low: c - 1, close: c, volume: 1 }));
}

describe("sma", () => {
  it("returns null during warm-up and the arithmetic mean afterwards", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("handles an empty input", () => {
    expect(sma([], 3)).toEqual([]);
  });
  it("is causal: adding future values does not change earlier outputs", () => {
    const a = sma([1, 2, 3, 4], 2);
    const b = sma([1, 2, 3, 4, 100, 200], 2);
    expect(b.slice(0, 4)).toEqual(a);
  });
});

describe("ema", () => {
  it("seeds with the SMA and then smooths", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(2);
    // k = 0.5: 4*0.5 + 2*0.5 = 3 ; 5*0.5 + 3*0.5 = 4
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });
});

describe("rsi", () => {
  it("is 100 when prices only rise and 0 when they only fall", () => {
    const up = rsi([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(up[3]).toBe(100);
    const down = rsi([8, 7, 6, 5, 4, 3, 2, 1], 3);
    expect(down[3]).toBe(0);
  });
  it("is null before period + 1 values", () => {
    expect(rsi([1, 2, 3], 3)).toEqual([null, null, null]);
  });
  it("stays within 0..100", () => {
    const prices = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 10 + (i % 7));
    for (const v of rsi(prices, 14)) if (v !== null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
  });
});

describe("macd", () => {
  it("has histogram = macd - signal where defined", () => {
    const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 8) * 5 + i * 0.1);
    const m = macd(prices, 12, 26, 9);
    for (let i = 0; i < prices.length; i++) {
      if (m.signal[i] !== null) expect(m.histogram[i]).toBeCloseTo((m.macd[i] as number) - (m.signal[i] as number), 10);
    }
    expect(m.signal[25 + 8]).not.toBeNull();
    expect(m.signal[25 + 7]).toBeNull();
  });
});

describe("atr", () => {
  it("equals the mean true range over the first period and smooths afterwards", () => {
    const c = candlesFrom([10, 11, 12, 13, 14]);
    const out = atr(c, 3);
    // Each bar's TR: first bar high-low = 2; later bars max(2, |high - prevClose|=2, |low - prevClose|=0) = 2.
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(2);
  });
});

describe("donchian", () => {
  it("excludes the current bar so breakouts compare against prior history", () => {
    const c = candlesFrom([10, 12, 11, 15, 9]);
    const d = donchian(c, 3);
    // At index 3, prior 3 bars are 0..2: highs 11,13,12 -> 13 ; lows 9,11,10 -> 9
    expect(d.upper[3]).toBe(13);
    expect(d.lower[3]).toBe(9);
    expect(d.upper[2]).toBeNull();
  });
});

describe("rollingStd", () => {
  it("is zero for a constant series", () => {
    const out = rollingStd([5, 5, 5, 5], 3);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
  });
});

describe("returns", () => {
  it("computes simple and trailing returns", () => {
    const r = simpleReturns([100, 110, 99]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.1, 10);
    expect(r[2]).toBeCloseTo(-0.1, 10);
    expect(trailingReturn([100, 110, 121], 2)[2]).toBeCloseTo(0.21, 10);
    expect(trailingReturn([100, 110, 121], 2)[1]).toBeNull();
  });
});
