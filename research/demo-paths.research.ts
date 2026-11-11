/**
 * Generates the demo process on 40 independent paths so its properties can be
 * judged as a process rather than from one draw, and so the published path can
 * be chosen as the most typical candidate.
 *
 *   OUT=<folder> npx vitest run --config research/vitest.research.config.mts demo-paths
 */

import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { demoSeriesOnPath } from "@/lib/market/demo-data";

const INSTRUMENTS = process.env.ONLY
  ? process.env.ONLY.split(",")
  : [
      "ASX:STW",
      "ASX:CBA",
      "ASX:BHP",
      "ASX:CSL",
      "ASX:XRO",
      "US:SPY",
      "US:AAPL",
      "US:JPM",
      "CRYPTO:BTC",
      "CRYPTO:SOL",
    ];
const PATHS = Number(process.env.PATHS ?? 40);

it("generates candidate paths", () => {
  const out: Record<
    string,
    Record<string, { market: string; c: number[] }>
  > = {};
  for (let path = 0; path < PATHS; path++) {
    out[path] = {};
    for (const id of INSTRUMENTS) {
      const s = demoSeriesOnPath(id, "1d", path);
      out[path][id] = { market: s.market, c: s.candles.map((c) => c.close) };
    }
  }
  writeFileSync(`${process.env.OUT}/demo-paths.json`, JSON.stringify(out));
});
