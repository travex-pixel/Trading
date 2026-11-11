import { describe, expect, it } from "vitest";
import type { CandleSeries } from "@/lib/quant/types";
import { alignByTime, neverMixSynthetic } from "./align";
import { DEMO_SOURCE, demoSeries } from "./demo-data";

const real = (asset: string, times: number[]): CandleSeries => ({
  asset,
  market: "US",
  currency: "USD",
  timeframe: "1d",
  candles: times.map((time) => ({
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 0,
  })),
  source: {
    provider: "eodhd",
    version: "eodhd-v1",
    label: "EODHD",
    isSynthetic: false,
    freshness: "historical",
    adjustment: "splits_dividends",
    asOf: 0,
  },
});

describe("combining series from the provider chain", () => {
  it("leaves an all-real set alone", () => {
    const set = [real("US:AAPL", [1, 2, 3]), real("US:MSFT", [2, 3, 4])];
    expect(neverMixSynthetic(set, "1d", demoSeries)).toBe(set);
    expect(alignByTime(set).map((s) => s.candles.map((c) => c.time))).toEqual([
      [2, 3],
      [2, 3],
    ]);
  });

  it("never puts real and synthetic prices in the same traded set", () => {
    const set = [real("US:AAPL", [1, 2, 3]), demoSeries("US:NVDA", "1d")];
    const out = neverMixSynthetic(set, "1d", demoSeries);
    expect(out.every((s) => s.source.isSynthetic)).toBe(true);
    expect(out[0].candles).toEqual(demoSeries("US:AAPL", "1d").candles);
    expect(out[0].source.label).toContain(DEMO_SOURCE.label);
    expect(out[0].source.label).toContain("live data unavailable for NVDA");
  });

  it("leaves an all-synthetic set alone", () => {
    const set = [demoSeries("ASX:CBA", "1d"), demoSeries("ASX:BHP", "1d")];
    expect(neverMixSynthetic(set, "1d", demoSeries)).toBe(set);
  });
});
