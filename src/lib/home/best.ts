/**
 * "Best strategy right now": rank the library on one instrument under
 * identical rules, pick the top by return per unit of risk, validate it, and
 * explain the result in plain English.
 *
 * Everything here is derived from engine output. The explanation never says
 * anything a number on screen does not back up, and the caveats are not
 * optional: a ranking is a comparison of the past, never a forecast.
 */

import { defaultPeriod, riskAdjustedScore } from "@/lib/lab/run";
import { fmtMoney, fmtNum, fmtPct, type Currency } from "@/lib/format";
import { getInstrument } from "@/lib/market/instruments";
import { runBacktest } from "@/lib/quant/backtest";
import { buyAndHoldConfig } from "@/lib/quant/benchmarks";
import type { BacktestResult, CandleSeries, DataSource } from "@/lib/quant/types";
import { assessEdge, regimePerformance, walkForward, type EdgeAssessment, type Period, type Verdict, type WalkForwardReport } from "@/lib/quant/validation";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";

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

export interface BestStrategyReport {
  asset: string;
  symbol: string;
  currency: Currency;
  timeframe: CandleSeries["timeframe"];
  period: Period;
  months: number;
  source: DataSource;
  ranked: RankedStrategy[];
  best: RankedStrategy;
  buyAndHold: BacktestResult;
  walkForward: WalkForwardReport | null;
  assessment: EdgeAssessment;
  /** The plain-English reading of the result. */
  meaning: {
    headline: string;
    points: MeaningPoint[];
    caveat: string;
    howRanked: string;
  };
}

/** Library strategies that trade one instrument and are ideas rather than benchmarks. */
export function rankableKinds(): StrategyKind[] {
  return STRATEGY_ORDER.filter((k) => {
    const meta = STRATEGY_LIBRARY[k];
    return !meta.benchmark && meta.defaults.assets.length === 1 && k !== "random_baseline";
  });
}

/** Run every rankable strategy on one series under identical rules and sort by return per unit of risk. */
export function rankLibrary(series: CandleSeries, period: Period = defaultPeriod([series])): { ranked: RankedStrategy[]; buyAndHold: BacktestResult; period: Period } {
  const rows: Omit<RankedStrategy, "rank">[] = [];
  const base = STRATEGY_LIBRARY[rankableKinds()[0]].defaults;
  const bhConfig = buyAndHoldConfig({ ...base, assets: [series.asset], timeframe: series.timeframe });
  const buyAndHold = runBacktest(bhConfig, [series], period);
  for (const kind of rankableKinds()) {
    const config: StrategyConfig = { ...STRATEGY_LIBRARY[kind].defaults, assets: [series.asset], timeframe: series.timeframe };
    try {
      const result = runBacktest(config, [series], period);
      rows.push({
        kind,
        name: STRATEGY_LIBRARY[kind].name,
        summary: STRATEGY_LIBRARY[kind].summary,
        config,
        result,
        score: riskAdjustedScore(result),
        beatsHolding: result.metrics.totalReturnPct > buyAndHold.metrics.totalReturnPct,
      });
    } catch {
      // A strategy that cannot run on this window is left off the board.
    }
  }
  rows.sort((a, b) => {
    const sa = a.score ?? -Infinity;
    const sb = b.score ?? -Infinity;
    if (sb !== sa) return sb - sa;
    return b.result.metrics.totalReturnPct - a.result.metrics.totalReturnPct;
  });
  return { ranked: rows.map((r, i) => ({ ...r, rank: i + 1 })), buyAndHold, period };
}

const VERDICT_SENTENCE: Record<Verdict, string> = {
  robust: "It held up on data it had not seen and across nearby parameter settings. That is as strong as a backtest gets, and it is still a backtest.",
  promising: "It held up reasonably on data it had not seen. Worth paper trading before anything else.",
  fragile: "It did well on these bars but weakened on data it had not seen. Treat the top spot as a lead to investigate, not a result to act on.",
  unproven: "There is not enough evidence here to call this an edge. The ranking tells you which rule did best on these bars, not which will work next.",
};

function monthsBetween(a: number, b: number): number {
  return Math.max(1, Math.round((b - a) / (30.44 * 86_400_000)));
}

/**
 * Build the full report for one instrument. Validation (walk-forward) is on
 * by default because the verdict is the honest half of "best"; pass
 * `validate: false` for a quick ranking only.
 */
export function bestStrategyReport(series: CandleSeries, options: { validate?: boolean; folds?: number } = {}): BestStrategyReport | null {
  if (series.candles.length < 120) return null;
  const { ranked, buyAndHold, period } = rankLibrary(series);
  const best = ranked.find((r) => r.score !== null) ?? ranked[0];
  if (!best) return null;

  const validate = options.validate ?? true;
  let wf: WalkForwardReport | null = null;
  if (validate) {
    try {
      wf = walkForward(best.config, [series], period, { folds: options.folds ?? 3 });
    } catch {
      wf = null;
    }
  }
  const regimes = regimePerformance(best.result, series);
  const assessment = assessEdge({ result: best.result, benchmark: buyAndHold, walkForward: wf, sensitivity: [], regimes, timeframe: series.timeframe });

  const symbol = getInstrument(series.asset)?.symbol ?? series.asset;
  const currency = series.currency;
  const m = best.result.metrics;
  const b = buyAndHold.metrics;
  const months = monthsBetween(period.start, period.end);
  const initial = best.result.assumptions.initialCapital;
  const final = initial * (1 + m.totalReturnPct / 100);
  const holdFinal = initial * (1 + b.totalReturnPct / 100);
  const money = (v: number) => fmtMoney(v, { currency, compact: false });

  const points: MeaningPoint[] = [
    {
      tone: best.beatsHolding ? "up" : "down",
      text: best.beatsHolding
        ? `It returned ${fmtPct(m.totalReturnPct, { sign: true })} after brokerage and slippage, against ${fmtPct(b.totalReturnPct, { sign: true })} for simply holding ${symbol}.`
        : `It returned ${fmtPct(m.totalReturnPct, { sign: true })} after costs, but simply holding ${symbol} made ${fmtPct(b.totalReturnPct, { sign: true })}. It ranks first on risk, not on return.`,
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
          ? `Only ${m.tradeCount} trades. A handful of lucky entries can carry a result this thin, so read it as promising at most.`
          : `${m.tradeCount} trades, enough that the win rate (${fmtPct(m.winRatePct ?? 0, { digits: 0 })}) means something.`,
    },
  ];
  if (wf) {
    const profitable = wf.folds.filter((f) => f.testMetrics.totalReturnPct > 0).length;
    points.push({
      tone: profitable >= Math.ceil(wf.folds.length / 2) ? "up" : "down",
      text: `Walk-forward test: parameters chosen on past data only stayed profitable in ${profitable} of ${wf.folds.length} unseen windows.`,
    });
  }

  return {
    asset: series.asset,
    symbol,
    currency,
    timeframe: series.timeframe,
    period,
    months,
    source: series.source,
    ranked,
    best,
    buyAndHold,
    walkForward: wf,
    assessment,
    meaning: {
      headline: `${best.name} would have turned ${money(initial)} into ${money(final)} on ${symbol} over the last ${months} months. Simply holding would have given ${money(holdFinal)}.`,
      points,
      caveat: VERDICT_SENTENCE[assessment.verdict],
      howRanked: `Ranked by return per unit of risk over the same ${months} months, on the same instrument, with the same brokerage and slippage. The highest return is not automatically the best strategy.`,
    },
  };
}
