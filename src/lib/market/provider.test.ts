import { describe, expect, it } from "vitest";
import { parseEodhdDaily, parseEodhdIntraday, parseEodhdQuote } from "./eodhd";
import { localParts } from "./calendar";

/** Shapes follow the EODHD documentation examples (eodhd.com/financial-apis). */
describe("EODHD parsers", () => {
  it("parses adjusted daily rows onto ASX session opens and scales OHLC by the adjustment factor", () => {
    const rows = [
      { date: "2024-01-03", open: 297, high: 297.99, low: 294.25, close: 294.39, adjusted_close: 275.4668, volume: 3114800 },
      { date: "2024-01-02", open: 295.05, high: 297.28, low: 295.05, close: 297.04, adjusted_close: 277.9465, volume: 4458400 },
      { date: "2024-01-06", open: 1, high: 1, low: 1, close: 1, adjusted_close: 1, volume: 1 }, // Saturday: still accepted but stamped at midnight
      { date: "bad", open: 1, high: 1, low: 1, close: 1 },
      { date: "2024-01-04", open: "x", high: 1, low: 1, close: 1 },
    ];
    const candles = parseEodhdDaily(rows, "ASX");
    expect(candles.length).toBe(3);
    expect(candles[0].time).toBeLessThan(candles[1].time);
    const p = localParts("Australia/Sydney", candles[0].time);
    expect([p.year, p.month, p.day, p.hour]).toEqual([2024, 1, 2, 10]);
    const f = 277.9465 / 297.04;
    expect(candles[0].close).toBeCloseTo(277.9465, 6);
    expect(candles[0].open).toBeCloseTo(295.05 * f, 6);
    expect(candles[0].high).toBeGreaterThanOrEqual(Math.max(candles[0].open, candles[0].close));
    expect(candles[0].volume).toBe(4458400);
  });

  it("parses intraday rows with unix timestamps and rejects garbage", () => {
    const rows = [
      { timestamp: 1627896900, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { timestamp: 1627900500, open: 10.5, high: 10.6, low: 10.4, close: 10.55, volume: 50 },
      { timestamp: 1627900500, open: 1, high: 1, low: 1, close: 1, volume: 1 }, // duplicate timestamp dropped
      { timestamp: "nope", open: 1, high: 1, low: 1, close: 1 },
    ];
    const candles = parseEodhdIntraday(rows);
    expect(candles.length).toBe(2);
    expect(candles[0].time).toBe(1627896900 * 1000);
    expect(() => parseEodhdIntraday({ not: "an array" })).toThrow();
  });

  it("parses a delayed quote and labels it as delayed", () => {
    const q = parseEodhdQuote({ code: "CBA.AU", timestamp: 1700000000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000, previousClose: 99.5, change: 1, change_p: 1.005 }, "ASX:CBA");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(100.5);
    expect(q!.time).toBe(1700000000 * 1000);
    expect(q!.changePct).toBeCloseTo(1.005, 6);
    expect(q!.source.freshness).toBe("delayed");
    expect(q!.source.isSynthetic).toBe(false);
    expect(parseEodhdQuote({ close: "NA", timestamp: 1 }, "ASX:CBA")).toBeNull();
  });
});
