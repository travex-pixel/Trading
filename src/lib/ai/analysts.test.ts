import { describe, expect, it } from "vitest";
import { demoSeries } from "@/lib/market/demo-data";
import { runLab } from "@/lib/lab/run";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { ruleBasedReview, runBrief } from "./analysts";
import { aiReviewSchema } from "./schema";

const series = [demoSeries("BTC", "1d"), demoSeries("ETH", "1d")];
const period = { start: series[0].candles[300].time, end: series[0].candles[series[0].candles.length - 1].time };

describe("rule-based review", () => {
  it("produces a schema-valid review whose figures come from the run", () => {
    const run = runLab({ ...STRATEGY_LIBRARY.ma_crossover.defaults, timeframe: "1d" }, series, period, { validate: true, folds: 3 });
    const review = ruleBasedReview(run);
    expect(aiReviewSchema.safeParse(review).success).toBe(true);
    expect(review.analysts.map((a) => a.role).sort()).toEqual(["quant", "research", "reviewer", "risk", "technical"]);
    expect(review.summary).toContain(run.result.metrics.totalReturnPct.toFixed(1));
    expect(review.provenance.mode).toBe("rule_based");
    for (const a of review.analysts) expect(a.statements.length).toBeGreaterThan(0);
  });

  it("never claims an edge on the synthetic dataset and includes the brief's key numbers", () => {
    const run = runLab({ ...STRATEGY_LIBRARY.buy_and_hold.defaults, timeframe: "1d" }, series, period);
    const review = ruleBasedReview(run);
    expect(review.limitations.some((l) => /demo dataset/i.test(l))).toBe(true);
    const brief = runBrief(run);
    expect(brief).toContain("SYNTHETIC");
    expect(brief).toContain(run.result.metrics.tradeCount.toString());
  });

  it("suggested experiments only patch parameters the strategy has", () => {
    const run = runLab({ ...STRATEGY_LIBRARY.rsi_mean_reversion.defaults, timeframe: "1d" }, series, period, { validate: true, folds: 3 });
    const review = ruleBasedReview(run);
    const allowed = new Set(Object.keys(run.config.params));
    for (const e of review.experiments) for (const k of Object.keys(e.paramPatch ?? {})) expect(allowed.has(k)).toBe(true);
  });
});
