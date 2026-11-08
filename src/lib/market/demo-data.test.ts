import { describe, expect, it } from "vitest";
import { isTradingDay, localParts } from "./calendar";
import { aggregateCandles, DEMO_END, DEMO_START, demoHourlyCandles, demoSeries } from "./demo-data";

describe("demo dataset", () => {
  it("is deterministic across calls", () => {
    const a = demoHourlyCandles("CRYPTO:BTC");
    const b = demoHourlyCandles("CRYPTO:BTC");
    expect(a[1000]).toEqual(b[1000]);
    expect(a[0].time).toBe(DEMO_START.CRYPTO);
    expect(a[a.length - 1].time).toBe(DEMO_END);
  });

  it("produces sane OHLC with strictly increasing hourly timestamps for crypto", () => {
    const c = demoHourlyCandles("CRYPTO:ETH");
    for (let i = 0; i < c.length; i++) {
      const bar = c[i];
      expect(bar.low).toBeGreaterThan(0);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      if (i > 0) expect(bar.time - c[i - 1].time).toBe(3_600_000);
    }
  });

  it("generates ASX bars only inside sessions on trading days, with overnight gaps", () => {
    const c = demoHourlyCandles("ASX:CBA");
    expect(c.length).toBeGreaterThan(5 * 240 * 6 - 200);
    let gaps = 0;
    for (let i = 0; i < c.length; i++) {
      const bar = c[i];
      expect(isTradingDay("ASX", bar.time)).toBe(true);
      const p = localParts("Australia/Sydney", bar.time);
      expect(p.hour).toBeGreaterThanOrEqual(10);
      expect(p.hour).toBeLessThan(16);
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      if (i > 0 && p.hour === 10 && Math.abs(bar.open / c[i - 1].close - 1) > 1e-9) gaps++;
    }
    expect(gaps).toBeGreaterThan(100);
  });

  it("has plausible prices (no explosions or collapse to zero)", () => {
    for (const [id, lo, hi] of [
      ["CRYPTO:BTC", 1_000, 2_000_000],
      ["ASX:CBA", 20, 2_000],
      ["US:AAPL", 30, 5_000],
    ] as const) {
      const closes = demoHourlyCandles(id).map((x) => x.close);
      expect(Math.min(...closes)).toBeGreaterThan(lo);
      expect(Math.max(...closes)).toBeLessThan(hi);
    }
  });

  it("aggregates ASX hourly bars into one daily bar per session with consistent OHLC", () => {
    const hourly = demoHourlyCandles("ASX:BHP");
    const daily = aggregateCandles(hourly, "1d", "ASX");
    const fourH = aggregateCandles(hourly, "4h", "ASX");
    expect(daily[0].open).toBe(hourly[0].open);
    expect(daily[0].close).toBe(hourly[5].close);
    expect(daily[0].high).toBe(Math.max(...hourly.slice(0, 6).map((c) => c.high)));
    expect(daily[0].low).toBe(Math.min(...hourly.slice(0, 6).map((c) => c.low)));
    expect(daily.length).toBe(hourly.length / 6);
    expect(fourH.length).toBe(daily.length * 2);
    expect(localParts("Australia/Sydney", daily[0].time).hour).toBe(10);
  });

  it("aggregates crypto to UTC day boundaries", () => {
    const hourly = demoHourlyCandles("CRYPTO:BTC");
    const daily = aggregateCandles(hourly, "1d", "CRYPTO");
    expect(daily[0].time % 86_400_000).toBe(0);
    expect(daily.length).toBe(Math.ceil(hourly.length / 24));
  });

  it("labels itself as synthetic and carries market and currency", () => {
    const s = demoSeries("ASX:CBA", "1d");
    expect(s.source.isSynthetic).toBe(true);
    expect(s.source.label).toContain("DEMO DATA");
    expect(s.market).toBe("ASX");
    expect(s.currency).toBe("AUD");
    expect(s.candles.length).toBeGreaterThan(1200);
  });
});
