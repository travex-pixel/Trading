/**
 * Does picking the best strategy help?
 *
 * The Command Centre ranks six library strategies on an instrument over the
 * last two years by return per unit of risk and calls the top one "best".
 * This study asks whether that choice predicts anything: in rolling windows,
 * pick the in-sample winner over two years, then see how it ranks over the
 * following year against the five it beat.
 *
 * Under no persistence, the winner's out-of-sample rank is uniform on 1..6
 * (mean 3.5) and the in-sample and out-of-sample scores are uncorrelated.
 *
 *   REALDATA=<folder> OUT=<folder> npx vitest run --config research/vitest.research.config.mts selection
 */

import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { rankableKinds } from "@/lib/home/best";
import { riskAdjustedScore } from "@/lib/lab/run";
import { demoSeriesOnPath } from "@/lib/market/demo-data";
import { parseEodhdDaily } from "@/lib/market/eodhd";
import { MARKETS } from "@/lib/market/instruments";
import { runBacktest } from "@/lib/quant/backtest";
import type { CandleSeries } from "@/lib/quant/types";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const IS_YEARS = Number(process.env.IS_YEARS ?? 2);
const OOS_YEARS = Number(process.env.OOS_YEARS ?? 1);

interface WindowResult {
  instrument: string;
  isStart: string;
  winner: StrategyKind;
  /** 1 is best. */
  winnerOosRank: number;
  spearman: number;
  winnerOosScore: number;
  medianOosScore: number;
  winnerOosReturn: number;
  holdOosReturn: number;
  holdOosScore: number;
  n: number;
}

function rankDesc(values: number[]): number[] {
  const order = values
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0]);
  const ranks = new Array<number>(values.length);
  order.forEach(([, i], r) => (ranks[i] = r + 1));
  return ranks;
}

function spearman(a: number[], b: number[]): number {
  const ra = rankDesc(a),
    rb = rankDesc(b);
  const n = a.length;
  const mean = (n + 1) / 2;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - mean) * (rb[i] - mean);
    da += (ra[i] - mean) ** 2;
    db += (rb[i] - mean) ** 2;
  }
  return num / Math.sqrt(da * db);
}

function windows(series: CandleSeries, label: string): WindowResult[] {
  const c = series.candles;
  const out: WindowResult[] = [];
  const costs = MARKETS[series.market].defaultCosts;
  const cfg = (kind: StrategyKind): StrategyConfig => ({
    ...STRATEGY_LIBRARY[kind].defaults,
    assets: [series.asset],
    timeframe: "1d",
    costs: { ...costs },
  });
  const kinds = rankableKinds();
  // Leave a year of history before the first window so every indicator is warm.
  let isStart = c[0].time + YEAR;
  const last = c[c.length - 1].time;
  while (isStart + (IS_YEARS + OOS_YEARS) * YEAR <= last + DAY) {
    const isEnd = isStart + IS_YEARS * YEAR;
    const oosEnd = isEnd + OOS_YEARS * YEAR;
    const score = (kind: StrategyKind, start: number, end: number) => {
      const r = runBacktest(cfg(kind), [series], { start, end });
      return {
        score: riskAdjustedScore(r) ?? -10,
        ret: r.metrics.totalReturnPct,
      };
    };
    const is = kinds.map((k) => score(k, isStart, isEnd));
    const oos = kinds.map((k) => score(k, isEnd + 1, oosEnd));
    const hold = score("buy_and_hold", isEnd + 1, oosEnd);
    const isScores = is.map((x) => x.score);
    const oosScores = oos.map((x) => x.score);
    const w = isScores.indexOf(Math.max(...isScores));
    const oosRanks = rankDesc(oosScores);
    const sorted = [...oosScores].sort((a, b) => a - b);
    out.push({
      instrument: label,
      isStart: new Date(isStart).toISOString().slice(0, 10),
      winner: kinds[w],
      winnerOosRank: oosRanks[w],
      spearman: spearman(isScores, oosScores),
      winnerOosScore: oosScores[w],
      medianOosScore: (sorted[2] + sorted[3]) / 2,
      winnerOosReturn: oos[w].ret,
      holdOosReturn: hold.ret,
      holdOosScore: hold.score,
      n: kinds.length,
    });
    isStart += OOS_YEARS * YEAR;
  }
  return out;
}

const real = (
  file: string,
  asset: string,
  market: "US" | "CRYPTO",
): CandleSeries => ({
  asset,
  market,
  currency: "USD",
  timeframe: "1d",
  candles: parseEodhdDaily(
    JSON.parse(readFileSync(`${process.env.REALDATA}/${file}`, "utf8")),
    market,
  ),
  source: {
    provider: "eodhd",
    version: "research",
    label: "EODHD",
    isSynthetic: false,
    freshness: "historical",
    adjustment: "splits_dividends",
    asOf: null,
  },
});

it("runs the selection study", () => {
  const results: Record<string, WindowResult[]> = { real: [], demo: [] };
  for (const [file, asset, market] of [
    ["AAPL.US.json", "US:AAPL", "US"],
    ["MSFT.US.json", "US:MSFT", "US"],
    ["AMZN.US.json", "US:AMZN", "US"],
    ["TSLA.US.json", "US:TSLA", "US"],
    ["VTI.US.json", "US:SPY", "US"],
    ["BTC-USD.CC.json", "CRYPTO:BTC", "CRYPTO"],
  ] as const) {
    results.real.push(
      ...windows(real(file, asset, market), file.replace(".json", "")),
    );
  }
  // The demo process on 30 independent paths, so the product's own data answers the same question.
  for (let path = 0; path < 30; path++) {
    for (const id of ["ASX:STW", "ASX:CBA", "ASX:BHP"])
      results.demo.push(
        ...windows(demoSeriesOnPath(id, "1d", path), `${id}#${path}`),
      );
  }
  writeFileSync(`${process.env.OUT}/selection.json`, JSON.stringify(results));
});
