/**
 * "Best strategy": rank the library on one instrument under identical rules,
 * name the top one, and then do what a sceptic would: ask whether luck could
 * have produced it, correct its Sharpe ratio for having picked the best of
 * several, and check whether picking the winner has worked before.
 *
 * Everything is derived from engine output. The explanation never says
 * anything a number on screen does not back up. A ranking compares the past.
 * It is not a forecast, and docs/research/picking-the-best.md shows that on
 * real markets last period's winner does no better than a random pick.
 */

import { HOLDOUT_DAYS, riskAdjustedScore } from "@/lib/lab/run";
import { fmtDate, fmtMoney, fmtNum, fmtPct, type Currency } from "@/lib/format";
import { getInstrument } from "@/lib/market/instruments";
import { runBacktest, windowCandles } from "@/lib/quant/backtest";
import { buyAndHoldConfig } from "@/lib/quant/benchmarks";
import { luckTest, type LuckTestResult } from "@/lib/quant/luck";
import { deflatedSharpe, moments, perBarSharpe } from "@/lib/quant/stats";
import type {
  BacktestResult,
  CandleSeries,
  DataSource,
} from "@/lib/quant/types";
import {
  assessEdge,
  regimePerformance,
  walkForward,
  type EdgeAssessment,
  type Period,
  type WalkForwardReport,
} from "@/lib/quant/validation";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
/** Bars of history every library strategy needs before it can signal (the slowest is a 100-bar average). */
const WARMUP_BARS = 120;

/**
 * The cross-market result this screen leans on, from research/selection.research.ts
 * (docs/research/picking-the-best.md). Real daily data for AAPL, MSFT, AMZN, TSLA,
 * VTI and Bitcoin, 2-year selection windows, 1 year out of sample.
 */
export const SELECTION_EVIDENCE = {
  windows: 140,
  firstYear: 1992,
  winnerRank: 3.66,
  chanceRank: 3.5,
  beatHoldingRiskAdjustedPct: 29,
} as const;

export interface RankedStrategy {
  kind: StrategyKind;
  name: string;
  /** One sentence a non-quant understands. */
  summary: string;
  config: StrategyConfig;
  result: BacktestResult;
  /** Return per unit of risk. Null when the strategy never traded. */
  score: number | null;
  rank: number;
  beatsHolding: boolean;
}

export interface MeaningPoint {
  tone: "up" | "down" | "neutral" | "warn";
  text: string;
}

export type LuckVerdict = "beats_luck" | "borderline" | "luck_explains";

export interface PickThenTrade {
  /** Winner over the two years before the last year. */
  winner: string;
  /** Its rank over the final year, 1 is best. */
  rankAfter: number;
  of: number;
  /** Strategy that actually did best over the final year. */
  bestAfter: string;
  pickedFrom: Period;
  judgedOn: Period;
}

export interface BestStrategyReport {
  asset: string;
  symbol: string;
  /** "CBA" for real data, "demo CBA prices" for the synthetic dataset. */
  subject: string;
  currency: Currency;
  timeframe: CandleSeries["timeframe"];
  period: Period;
  source: DataSource;
  ranked: RankedStrategy[];
  best: RankedStrategy;
  buyAndHold: BacktestResult;
  walkForward: WalkForwardReport | null;
  assessment: EdgeAssessment;
  luck: LuckTestResult | null;
  luckVerdict: LuckVerdict;
  /** Probability the winner's Sharpe is above zero after correcting for picking the best. */
  deflatedSharpe: number | null;
  pickThenTrade: PickThenTrade | null;
  meaning: {
    headline: string;
    /** The money in one short line, for phones. */
    short: string;
    /** One line for the hero: could luck have done this? */
    luckLine: string;
    points: MeaningPoint[];
    caveat: string;
    howRanked: string;
    pickedLine: string | null;
    researchLine: string;
  };
}

/** Library strategies that trade one instrument and are ideas rather than benchmarks. */
export function rankableKinds(): StrategyKind[] {
  return STRATEGY_ORDER.filter((k) => {
    const meta = STRATEGY_LIBRARY[k];
    return (
      !meta.benchmark &&
      meta.defaults.assets.length === 1 &&
      k !== "random_baseline"
    );
  });
}

/**
 * The analysis window: all history before the paper-trading holdout, after
 * warm-up. Two years is too little to tell skill from luck (see luck.test.ts),
 * so the screen uses everything available.
 */
export function analysisPeriod(series: CandleSeries): Period | null {
  const c = series.candles;
  if (c.length < WARMUP_BARS + 250) return null;
  const end = c[c.length - 1].time - HOLDOUT_DAYS * DAY;
  const start = c[WARMUP_BARS].time;
  return end - start >= YEAR ? { start, end } : null;
}

function configFor(kind: StrategyKind, series: CandleSeries): StrategyConfig {
  return {
    ...STRATEGY_LIBRARY[kind].defaults,
    assets: [series.asset],
    timeframe: series.timeframe,
  };
}

/** Run every rankable strategy on one series under identical rules and sort by return per unit of risk. */
export function rankLibrary(
  series: CandleSeries,
  period: Period,
): { ranked: RankedStrategy[]; buyAndHold: BacktestResult } {
  const kinds = rankableKinds();
  const buyAndHold = runBacktest(
    buyAndHoldConfig(configFor(kinds[0], series)),
    [series],
    period,
  );
  const rows: Omit<RankedStrategy, "rank">[] = [];
  for (const kind of kinds) {
    const config = configFor(kind, series);
    try {
      const result = runBacktest(config, [series], period);
      rows.push({
        kind,
        name: STRATEGY_LIBRARY[kind].name,
        summary: STRATEGY_LIBRARY[kind].summary,
        config,
        result,
        score: riskAdjustedScore(result),
        beatsHolding:
          result.metrics.totalReturnPct > buyAndHold.metrics.totalReturnPct,
      });
    } catch {
      // A strategy that cannot run on this window is left off the board.
    }
  }
  rows.sort(
    (a, b) =>
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      b.result.metrics.totalReturnPct - a.result.metrics.totalReturnPct,
  );
  return { ranked: rows.map((r, i) => ({ ...r, rank: i + 1 })), buyAndHold };
}

function equityReturns(r: BacktestResult): number[] {
  const out: number[] = [];
  for (let i = 1; i < r.equity.length; i++)
    out.push(r.equity[i].equity / r.equity[i - 1].equity - 1);
  return out;
}

/** The winner of the two years before the final year, and where it ranked over that final year. */
function pickThenTrade(
  series: CandleSeries,
  period: Period,
): PickThenTrade | null {
  const judgedOn = { start: period.end - YEAR, end: period.end };
  const pickedFrom = {
    start: judgedOn.start - 2 * YEAR,
    end: judgedOn.start - DAY,
  };
  if (pickedFrom.start < period.start) return null;
  const before = rankLibrary(series, pickedFrom).ranked;
  const after = rankLibrary(series, judgedOn).ranked;
  const winner = before.find((r) => r.score !== null);
  if (!winner || after.length === 0) return null;
  const rankAfter =
    after.find((r) => r.kind === winner.kind)?.rank ?? after.length;
  return {
    winner: winner.name,
    rankAfter,
    of: after.length,
    bestAfter: after[0].name,
    pickedFrom,
    judgedOn,
  };
}

const VERDICT_SENTENCE: Record<EdgeAssessment["verdict"], string> = {
  robust:
    "It also held up on data it had not seen and across nearby settings. That is as strong as a backtest gets, and it is still a backtest.",
  promising:
    "It held up reasonably on data it had not seen. Worth paper trading before anything else.",
  fragile:
    "It weakened on data it had not seen. Treat the top spot as a lead to investigate, not a result to act on.",
  unproven:
    "There is not enough evidence to call this an edge. The ranking says which rule did best on these bars, not which will work next.",
};

const ordinal = (n: number) =>
  n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;

/**
 * Build the full report for one instrument. `simulations` controls the luck
 * test's precision. `validate` adds the walk-forward test behind the verdict.
 */
export function bestStrategyReport(
  series: CandleSeries,
  options: { validate?: boolean; simulations?: number } = {},
): BestStrategyReport | null {
  const period = analysisPeriod(series);
  if (!period) return null;
  const { ranked, buyAndHold } = rankLibrary(series, period);
  const best = ranked.find((r) => r.score !== null) ?? ranked[0];
  if (!best) return null;

  let wf: WalkForwardReport | null = null;
  if (options.validate ?? true) {
    try {
      wf = walkForward(best.config, [series], period, { folds: 3 });
    } catch {
      wf = null;
    }
  }
  const assessment = assessEdge({
    result: best.result,
    benchmark: buyAndHold,
    walkForward: wf,
    sensitivity: [],
    regimes: regimePerformance(best.result, series),
    timeframe: series.timeframe,
  });

  // Could luck have done this? Same exposure, same trades, random timing, best of the same number.
  const traded = ranked.filter(
    (r) => r.result.equity.length === best.result.equity.length,
  );
  const luck = luckTest({
    results: traded.map((r) => r.result),
    candles: windowCandles(series, best.result),
    simulations: options.simulations,
  });
  const luckVerdict: LuckVerdict = !luck
    ? "luck_explains"
    : luck.pValue < 0.05
      ? "beats_luck"
      : luck.pValue < 0.1
        ? "borderline"
        : "luck_explains";

  // Deflated Sharpe: the winner's Sharpe corrected for being the best of several, for sample length and for fat tails.
  const perBar = traded.map((r) => perBarSharpe(equityReturns(r.result)));
  const meanSr = perBar.reduce((a, b) => a + b, 0) / Math.max(1, perBar.length);
  const variance =
    perBar.reduce((a, b) => a + (b - meanSr) ** 2, 0) /
    Math.max(1, perBar.length - 1);
  const bestReturns = equityReturns(best.result);
  const mo = moments(bestReturns);
  const dsr =
    bestReturns.length > 30
      ? deflatedSharpe({
          observed: perBarSharpe(bestReturns),
          trials: traded.length,
          sharpeVariance: variance,
          bars: bestReturns.length,
          skew: mo.skew,
          kurtosis: mo.kurtosis,
        }).dsr
      : null;

  const picked = pickThenTrade(series, period);

  // The walk-forward verdict ignores that this strategy was picked as the best
  // of several, so cap it by the luck test: if shifting the same trades to other
  // dates does about as well, nothing here is evidence of skill.
  const walkForwardVerdict = assessment.verdict;
  const finalVerdict: EdgeAssessment["verdict"] =
    luckVerdict === "luck_explains"
      ? "unproven"
      : luckVerdict === "borderline" &&
          (walkForwardVerdict === "robust" ||
            walkForwardVerdict === "promising")
        ? "fragile"
        : walkForwardVerdict;

  const symbol = getInstrument(series.asset)?.symbol ?? series.asset;
  const subject = series.source.isSynthetic ? `demo ${symbol} prices` : symbol;
  const currency = series.currency;
  const m = best.result.metrics;
  const b = buyAndHold.metrics;
  const initial = best.result.assumptions.initialCapital;
  const money = (v: number) => fmtMoney(v, { currency, compact: false });
  const span = `${fmtDate(period.start)} to ${fmtDate(period.end)}`;
  const luckPct = luck ? Math.max(1, Math.round(luck.pValue * 100)) : null;

  const luckLine =
    luck === null
      ? "Not enough history to test whether luck could explain it."
      : luckVerdict === "beats_luck"
        ? `Hard to explain by luck. Shifting the same trades to other dates did as well only ${luckPct}% of the time.`
        : luckVerdict === "borderline"
          ? `Borderline. Shifting the same trades to other dates did as well ${luckPct}% of the time.`
          : `Luck could explain it. Shifting the same trades to other dates did as well ${luckPct}% of the time.`;

  const points: MeaningPoint[] = [
    {
      tone: best.beatsHolding ? "up" : "down",
      text: best.beatsHolding
        ? `It returned ${fmtPct(m.totalReturnPct, { sign: true })} after brokerage and slippage, against ${fmtPct(b.totalReturnPct, { sign: true })} for simply holding.`
        : `It returned ${fmtPct(m.totalReturnPct, { sign: true })} after costs, but simply holding made ${fmtPct(b.totalReturnPct, { sign: true })}. It ranks first on risk, not on return.`,
    },
    {
      tone: m.maxDrawdownPct < b.maxDrawdownPct ? "up" : "warn",
      text: `Its worst fall from a high was ${fmtPct(m.maxDrawdownPct)}, ${m.maxDrawdownPct < b.maxDrawdownPct ? "shallower than" : "deeper than"} the ${fmtPct(b.maxDrawdownPct)} you would have sat through holding.`,
    },
    {
      tone: "neutral",
      text:
        m.sharpe !== null
          ? `It earned ${fmtNum(m.sharpe)} per unit of risk (Sharpe ratio), the highest of the ${ranked.length} strategies run on the same bars with the same costs.`
          : `Too few bars to estimate a Sharpe ratio, so it is ranked on return divided by worst fall: ${fmtNum(best.score)}.`,
    },
    {
      tone: m.tradeCount < 30 ? "warn" : "neutral",
      text:
        m.tradeCount < 30
          ? `Only ${m.tradeCount} trades. A handful of lucky entries can carry a result this thin.`
          : `${m.tradeCount} trades, enough that the win rate (${fmtPct(m.winRatePct ?? 0, { digits: 0 })}) means something.`,
    },
  ];
  if (wf) {
    const profitable = wf.folds.filter(
      (f) => f.testMetrics.totalReturnPct > 0,
    ).length;
    points.push({
      tone: profitable >= Math.ceil(wf.folds.length / 2) ? "up" : "down",
      text: `Walk-forward test: settings chosen on past data only stayed profitable in ${profitable} of ${wf.folds.length} unseen stretches.`,
    });
  }

  const pickedLine = picked
    ? picked.winner === picked.bestAfter
      ? `Picked a year earlier, the winner of the two years before (${picked.winner}) stayed on top over the last year. It happens, about one time in six by chance alone.`
      : `Picked a year earlier, the winner of the two years before (${picked.winner}) then came ${ordinal(picked.rankAfter)} of ${picked.of} over the last year. ${picked.bestAfter} did best.`
    : null;

  return {
    asset: series.asset,
    symbol,
    subject,
    currency,
    timeframe: series.timeframe,
    period,
    source: series.source,
    ranked,
    best,
    buyAndHold,
    walkForward: wf,
    assessment: { ...assessment, verdict: finalVerdict },
    luck,
    luckVerdict,
    deflatedSharpe: dsr,
    pickThenTrade: picked,
    meaning: {
      short: `${series.source.isSynthetic ? "On demo prices, " : ""}${money(initial)} became ${money(initial * (1 + m.totalReturnPct / 100))}. Holding gave ${money(initial * (1 + b.totalReturnPct / 100))}.`,
      headline: `From ${span}, ${best.name} did best of ${ranked.length} on ${subject}. It turned ${money(initial)} into ${money(initial * (1 + m.totalReturnPct / 100))}, while holding gave ${money(initial * (1 + b.totalReturnPct / 100))}.`,
      luckLine,
      points,
      caveat:
        finalVerdict !== walkForwardVerdict
          ? `The walk-forward check on its own looked ${walkForwardVerdict}, but this strategy was picked as the best of ${ranked.length} and ${luckVerdict === "luck_explains" ? "luck could explain its result" : "its result is only borderline against luck"}, so it is not evidence of an edge yet.`
          : VERDICT_SENTENCE[finalVerdict],
      howRanked: `Ranked by return per unit of risk from ${span}, on the same instrument, with the same brokerage and slippage. The highest return is not automatically the best strategy.`,
      pickedLine,
      researchLine: `On real markets, picking last period's winner has not helped. In ${SELECTION_EVIDENCE.windows} tests on US stocks, an index fund and Bitcoin since ${SELECTION_EVIDENCE.firstYear}, the winner of the previous two years ranked ${SELECTION_EVIDENCE.winnerRank.toFixed(1)} of 6 the following year, no better than a random pick, and beat simply holding ${SELECTION_EVIDENCE.beatHoldingRiskAdjustedPct}% of the time.`,
    },
  };
}
