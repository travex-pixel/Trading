import { describe, expect, it } from "vitest";
import { aggregateCandles, DEMO_END, DEMO_START, demoHourlyCandles, demoSeries } from "./demo-data";

describe("demo dataset", () => {
  it("is deterministic across calls", () => {
    const a = demoHourlyCandles("BTC");
    const b = demoHourlyCandles("BTC");
    expect(a[1000]).toEqual(b[1000]);
    expect(a[0].time).toBe(DEMO_START);
    expect(a[a.length - 1].time).toBe(DEMO_END);
  });

  it("produces sane OHLC with strictly increasing hourly timestamps", () => {
    const c = demoHourlyCandles("ETH");
    for (let i = 0; i < c.length; i++) {
      const bar = c[i];
      expect(bar.low).toBeGreaterThan(0);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      if (i > 0) expect(bar.time - c[i - 1].time).toBe(3_600_000);
    }
  });

  it("has plausible prices (no explosions or collapse to zero)", () => {
    const c = demoHourlyCandles("BTC");
    const closes = c.map((x) => x.close);
    expect(Math.min(...closes)).toBeGreaterThan(1_000);
    expect(Math.max(...closes)).toBeLessThan(2_000_000);
  });

  it("aggregates to daily bars on UTC day boundaries with consistent OHLC", () => {
    const hourly = demoHourlyCandles("BTC");
    const daily = aggregateCandles(hourly, "1d");
    expect(daily[0].time % 86_400_000).toBe(0);
    expect(daily[0].open).toBe(hourly[0].open);
    expect(daily[0].close).toBe(hourly[23].close);
    expect(daily[0].high).toBe(Math.max(...hourly.slice(0, 24).map((c) => c.high)));
    expect(daily[0].low).toBe(Math.min(...hourly.slice(0, 24).map((c) => c.low)));
    expect(daily.length).toBe(Math.ceil(hourly.length / 24));
  });

  it("labels itself as synthetic", () => {
    const s = demoSeries("BTC", "4h");
    expect(s.source.isSynthetic).toBe(true);
    expect(s.source.label).toContain("DEMO DATA");
    expect(s.candles.length).toBeGreaterThan(6_000);
  });
});
