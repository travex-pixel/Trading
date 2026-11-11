/**
 * Writes the engine's trades and final value on real daily data so
 * reference_engine.py can recompute them independently and compare.
 *
 *   REALDATA=<folder of EODHD JSON> OUT=<folder> npx vitest run --config research/vitest.research.config.mts reference-check
 */

import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { parseEodhdDaily } from "@/lib/market/eodhd";
import { runBacktest } from "@/lib/quant/backtest";
import type { CandleSeries } from "@/lib/quant/types";
import type { StrategyConfig } from "@/lib/strategies/schema";

const DIR = process.env.REALDATA!;
const OUT = process.env.OUT!;

function config(
  params: StrategyConfig["params"],
  asset: string,
): StrategyConfig {
  return {
    v: 1,
    name: "reference",
    assets: [asset],
    timeframe: "1d",
    params,
    risk: {
      stopLossPct: null,
      takeProfitPct: null,
      sizing: { mode: "fixed_fraction", fraction: 1 },
      maxPositions: 1,
    },
    costs: { feeBps: 5, slippageBps: 5, feeFixed: 10 },
    initialCapital: 10_000,
  };
}

for (const [file, asset] of [
  ["AAPL.US.json", "US:AAPL"],
  ["MSFT.US.json", "US:MSFT"],
] as const) {
  it(`engine output for ${file}`, () => {
    const candles = parseEodhdDaily(
      JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")),
      "US",
    );
    const series: CandleSeries = {
      asset,
      market: "US",
      currency: "USD",
      timeframe: "1d",
      candles,
      source: {
        provider: "eodhd",
        version: "research",
        label: "EODHD",
        isSynthetic: false,
        freshness: "historical",
        adjustment: "splits_dividends",
        asOf: null,
      },
    };
    // EODHD dates are New York trading days, and bars are stamped at the session open in UTC.
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    const cases = [
      {
        label: "buy and hold",
        kind: "buy_and_hold",
        params: { kind: "buy_and_hold" } as const,
      },
      {
        label: "EMA crossover 20/60",
        kind: "ma_crossover",
        ma: "ema",
        params: {
          kind: "ma_crossover",
          fast: 20,
          slow: 60,
          maType: "ema",
        } as const,
      },
      {
        label: "SMA crossover 20/60",
        kind: "ma_crossover",
        ma: "sma",
        params: {
          kind: "ma_crossover",
          fast: 20,
          slow: 60,
          maType: "sma",
        } as const,
      },
    ].map((c) => {
      const r = runBacktest(config(c.params, asset), [series]);
      return {
        label: c.label,
        kind: c.kind,
        ma: c.ma,
        final: r.equity[r.equity.length - 1].equity,
        trades: r.trades.map((t) => ({
          entry: day(t.entryTime),
          exit: day(t.exitTime),
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          pnl: t.pnl,
        })),
      };
    });
    writeFileSync(`${OUT}/engine-${file}`, JSON.stringify({ cases }));
  });
}
