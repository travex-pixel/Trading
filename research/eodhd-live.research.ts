import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseEodhdDaily,
  parseEodhdIntraday,
  parseEodhdQuote,
} from "@/lib/market/eodhd";

const DIR = process.env.REALDATA!;
const load = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));

describe("EODHD parsers on real responses", () => {
  for (const [file, market] of [
    ["AAPL.US.json", "US"],
    ["MSFT.US.json", "US"],
    ["AMZN.US.json", "US"],
    ["TSLA.US.json", "US"],
    ["VTI.US.json", "US"],
    ["BTC-USD.CC.json", "CRYPTO"],
  ] as const) {
    it(`parses ${file}`, () => {
      const rows = load(file);
      const candles = parseEodhdDaily(rows, market);
      const dropped = rows.length - candles.length;
      // Largest one-bar move in the adjusted series: a split left unadjusted shows as a 50%+ gap.
      let worst = 0,
        worstAt = "";
      for (let i = 1; i < candles.length; i++) {
        const r = Math.abs(Math.log(candles[i].open / candles[i - 1].close));
        if (r > worst) {
          worst = r;
          worstAt = new Date(candles[i].time).toISOString().slice(0, 10);
        }
      }
      const first = new Date(candles[0].time).toISOString(),
        last = new Date(candles[candles.length - 1].time).toISOString();
      const ohlcOk = candles.every(
        (c) =>
          c.low <= Math.min(c.open, c.close) + 1e-9 &&
          c.high >= Math.max(c.open, c.close) - 1e-9 &&
          c.low > 0,
      );
      const sorted = candles.every(
        (c, i) => i === 0 || c.time > candles[i - 1].time,
      );
      console.log(
        `${file.padEnd(16)} rows=${rows.length} candles=${candles.length} dropped=${dropped} first=${first} last=${last} biggestGap=${(worst * 100).toFixed(1)}%@${worstAt} ohlcOk=${ohlcOk} sorted=${sorted}`,
      );
      expect(ohlcOk).toBe(true);
      expect(sorted).toBe(true);
      expect(candles.length).toBeGreaterThan(rows.length * 0.99);
    });
  }
  it("parses real intraday rows", () => {
    const rows = load("AAPL.intraday.json");
    const c = parseEodhdIntraday(rows);
    console.log(
      "intraday rows",
      rows.length,
      "candles",
      c.length,
      "first",
      new Date(c[0].time).toISOString(),
      "sample row",
      JSON.stringify(rows[0]),
    );
    expect(c.length).toBe(rows.length);
  });
  it("parses a real-time quote with open:0", () => {
    if (!existsSync(`${DIR}/quote.json`)) return;
    const q = parseEodhdQuote(load("quote.json"), "US:AAPL");
    console.log("quote", JSON.stringify(q));
    expect(q).not.toBeNull();
  });
});
