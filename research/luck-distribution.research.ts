/**
 * Distribution of the Command Centre's luck-test p-values on the demo process
 * (40 paths) and on real data (4.5-year slices). If the library rules have no
 * timing skill and the test is fair, p-values are roughly uniform.
 *
 *   REALDATA=<folder> OUT=<folder> npx vitest run --config research/vitest.research.config.mts luck-distribution
 */

import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { bestStrategyReport } from "@/lib/home/best";
import { demoSeriesOnPath } from "@/lib/market/demo-data";
import { parseEodhdDaily } from "@/lib/market/eodhd";
import type { CandleSeries } from "@/lib/quant/types";

it("collects p-values", () => {
  const out: Record<string, Array<{ id: string; p: number; dsr: number | null; best: string }>> = { demo: [], real: [] };
  for (let path = 0; path < 40; path++) {
    for (const id of ["ASX:STW", "ASX:CBA", "ASX:BHP"]) {
      const r = bestStrategyReport(demoSeriesOnPath(id, "1d", path), { validate: false });
      if (r?.luck) out.demo.push({ id: `${id}#${path}`, p: r.luck.pValue, dsr: r.deflatedSharpe, best: r.best.kind });
    }
  }
  const sliceYears = 4.5;
  for (const [file, asset] of [["AAPL.US.json", "US:AAPL"], ["MSFT.US.json", "US:MSFT"], ["AMZN.US.json", "US:AMZN"], ["TSLA.US.json", "US:TSLA"], ["VTI.US.json", "US:SPY"]] as const) {
    const candles = parseEodhdDaily(JSON.parse(readFileSync(`${process.env.REALDATA}/${file}`, "utf8")), "US");
    const span = sliceYears * 252;
    for (let i = 0; i + span <= candles.length; i += Math.floor(span)) {
      const s: CandleSeries = { asset, market: "US", currency: "USD", timeframe: "1d", candles: candles.slice(i, i + span), source: { provider: "eodhd", version: "research", label: "EODHD", isSynthetic: false, freshness: "historical", adjustment: "splits_dividends", asOf: null } };
      const r = bestStrategyReport(s, { validate: false });
      if (r?.luck) out.real.push({ id: `${file}@${new Date(candles[i].time).toISOString().slice(0, 4)}`, p: r.luck.pValue, dsr: r.deflatedSharpe, best: r.best.kind });
    }
  }
  writeFileSync(`${process.env.OUT}/luck-distribution.json`, JSON.stringify(out));
});
