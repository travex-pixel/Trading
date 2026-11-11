/**
 * Dumps daily demo closes for every instrument so the stylised-facts study
 * (stylised_facts.py) can compare them with real markets.
 *
 *   OUT=<folder> npx vitest run --config research/vitest.research.config.mts dump-demo
 */

import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { INSTRUMENTS } from "@/lib/market/instruments";

it("dumps demo daily bars", () => {
  const out: Record<
    string,
    { market: string; t: number[]; o: number[]; c: number[] }
  > = {};
  for (const inst of INSTRUMENTS) {
    const s = demoSeries(inst.id, "1d");
    out[inst.id] = {
      market: inst.market,
      t: s.candles.map((c) => c.time),
      o: s.candles.map((c) => c.open),
      c: s.candles.map((c) => c.close),
    };
  }
  writeFileSync(`${process.env.OUT}/demo-daily.json`, JSON.stringify(out));
});
