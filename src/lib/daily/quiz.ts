/**
 * Today's Five: a daily quiz generated from the real engine.
 *
 * Every question is built from actual backtests on the dataset, seeded by the
 * calendar date so everyone gets the same five questions on the same day and
 * tomorrow's are different. Nothing is hand-written trivia: the figures, the
 * answers and the lessons all come from the numbers the engine produced.
 *
 * The point of the game is calibration. Each question is a situation where
 * people are reliably overconfident (telling a random walk from a strategy,
 * guessing a drawdown, predicting a single trade), and every answer reveals a
 * one-sentence lesson with the evidence.
 */

import { runBacktest } from "@/lib/quant/backtest";
import { buyAndHoldConfig } from "@/lib/quant/benchmarks";
import { hashSeed, mulberry32 } from "@/lib/quant/prng";
import type { BacktestResult, CandleSeries } from "@/lib/quant/types";
import { STRATEGY_LIBRARY, type StrategyMeta } from "@/lib/strategies/library";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";
import { encodeSnapshot } from "@/lib/store/snapshot";
import { downsample } from "@/lib/utils";
import type { DataSource } from "@/lib/quant/types";

/** The instruments the daily quiz rotates through: liquid ASX names plus the ASX 200 ETF. */
export const QUIZ_INSTRUMENTS = ["ASX:CBA", "ASX:BHP", "ASX:CSL", "ASX:STW", "ASX:WES", "ASX:MQG"];
export const QUIZ_TIMEFRAME = "1d" as const;

/* ------------------------------------------------------------------------- */
/* Types                                                                      */
/* ------------------------------------------------------------------------- */

export type QuizFigure =
  | { type: "curves"; series: Array<{ label: string; points: number[]; revealName: string }>; hideScale?: boolean }
  | { type: "price"; closes: number[]; entryIndex: number; entryPrice: number; asset: string }
  | { type: "stats"; rows: Array<{ label: string; cells: Array<{ key: string; value: string }> }> };

export interface QuizChoice {
  label: string;
  detail?: string;
}

export interface QuizQuestion {
  id: string;
  kind: "spot_the_random" | "beat_the_market" | "drawdown_guess" | "trade_outcome" | "risk_adjusted" | "fee_bite";
  /** Short category shown above the question. */
  topic: string;
  prompt: string;
  figure: QuizFigure;
  choices: QuizChoice[];
  answerIndex: number;
  /** The one-sentence lesson, with the evidence. */
  lesson: string;
  /** Extra evidence rendered under the lesson in mono. */
  evidence: string[];
  /** Snapshot code to open the relevant experiment in the Lab, when it applies. */
  labCode: string | null;
}

export interface DailyQuiz {
  /** YYYY-MM-DD in UTC. */
  date: string;
  seed: number;
  asset: string;
  /** Short display name for the instrument, e.g. "CBA". */
  symbol: string;
  currency: string;
  timeframe: string;
  period: { start: number; end: number };
  source: DataSource;
  questions: QuizQuestion[];
}

/** Choose today's instrument from the available series, by the date's seed. */
export function pickQuizSeries(date: string, available: CandleSeries[]): CandleSeries {
  if (available.length === 0) throw new Error("No data for the quiz.");
  const rng = mulberry32(hashSeed(`edgelab-daily-pick:${date}`));
  return available[Math.floor(rng() * available.length)];
}

export const QUIZ_SIZE = 5;

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

export function utcDateKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

const pct = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
const num = (v: number | null) => (v === null || !Number.isFinite(v) ? "n/a" : v.toFixed(2));

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalise(equity: BacktestResult["equity"], points = 90): number[] {
  const base = equity[0]?.equity ?? 1;
  return downsample(equity, points).map((p) => (p.equity / base) * 100);
}

function monthsBetween(a: number, b: number): number {
  return Math.max(1, Math.round((b - a) / (30.44 * 86_400_000)));
}

const QUIZ_KINDS: StrategyKind[] = ["ma_crossover", "rsi_mean_reversion", "macd_momentum", "breakout", "trend_following", "tsmom"];

interface Candidate {
  meta: StrategyMeta;
  config: StrategyConfig;
  result: BacktestResult;
}

function labCode(config: StrategyConfig, period: { start: number; end: number }, dataVersion: string): string | null {
  try {
    return encodeSnapshot({ v: 1, config, start: period.start, end: period.end, data: dataVersion, title: `Today's Five · ${config.name}` });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* Generator                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Build the quiz for a date from a candle series (one asset). Deterministic:
 * the same date, dataset version and series produce the same quiz.
 */
export function buildDailyQuiz(date: string, series: CandleSeries): DailyQuiz {
  const seed = hashSeed(`edgelab-daily:${date}:${series.source.version}:${series.asset}`);
  const rng = mulberry32(seed);
  const candles = series.candles;
  if (candles.length < 400) throw new Error("Not enough data for a quiz.");
  const symbol = series.asset.split(":")[1] ?? series.asset;

  // A window of 12 to 24 months somewhere in the data, leaving warm-up room for the slowest indicator.
  const windowMonths = 12 + Math.floor(rng() * 13);
  const windowMs = windowMonths * 30.44 * 86_400_000;
  const firstStart = candles[Math.min(candles.length - 1, 120)].time;
  const lastStart = candles[candles.length - 1].time - windowMs;
  const start = lastStart > firstStart ? firstStart + rng() * (lastStart - firstStart) : firstStart;
  const period = { start: Math.floor(start), end: Math.floor(start + windowMs) };

  const base = (kind: StrategyKind): StrategyConfig => ({ ...STRATEGY_LIBRARY[kind].defaults, assets: [series.asset], timeframe: series.timeframe });

  const candidates: Candidate[] = [];
  for (const kind of QUIZ_KINDS) {
    const config = base(kind);
    try {
      const result = runBacktest(config, [series], period);
      if (result.trades.length >= 3) candidates.push({ meta: STRATEGY_LIBRARY[kind], config, result });
    } catch {
      // skip strategies that cannot run on this window
    }
  }
  const bh = runBacktest(buyAndHoldConfig(base("buy_and_hold")), [series], period);
  const randomConfig: StrategyConfig = { ...base("random_baseline"), params: { kind: "random_baseline", seed: Math.floor(rng() * 10_000), flipProbability: 0.05 } };
  const random = runBacktest(randomConfig, [series], period);
  if (candidates.length < 2) throw new Error("Not enough strategies traded in this window.");

  const months = monthsBetween(period.start, period.end);
  const dataVersion = series.source.version;
  const questions: QuizQuestion[] = [];

  // 1. Spot the random walk.
  {
    const [a, b] = shuffle(rng, candidates).slice(0, 2);
    const entries = shuffle(rng, [
      { name: a.meta.name, result: a.result, isRandom: false },
      { name: b.meta.name, result: b.result, isRandom: false },
      { name: "Random baseline (coin flips)", result: random, isRandom: true },
    ]);
    const labels = ["A", "B", "C"];
    const answerIndex = entries.findIndex((e) => e.isRandom);
    questions.push({
      id: "spot_the_random",
      kind: "spot_the_random",
      topic: "Luck or skill",
      prompt: `Three equity curves over the same ${months} months on ${symbol}. One of them is a bot that flips a coin every bar. Which one?`,
      figure: { type: "curves", series: entries.map((e, i) => ({ label: labels[i], points: normalise(e.result.equity), revealName: e.name })), hideScale: true },
      choices: labels.map((l) => ({ label: `Curve ${l}` })),
      answerIndex,
      lesson: `The coin flip was ${labels[answerIndex]}. It ${random.metrics.totalReturnPct >= 0 ? "made" : "lost"} ${Math.abs(random.metrics.totalReturnPct).toFixed(1)}% over ${months} months, which is why a good-looking curve proves nothing on its own.`,
      evidence: entries.map((e, i) => `${labels[i]} · ${e.name} · ${pct(e.result.metrics.totalReturnPct)} · max DD ${pct(-e.result.metrics.maxDrawdownPct)} · ${e.result.metrics.tradeCount} trades`),
      labCode: null,
    });
  }

  // 2. Did it beat the market?
  {
    const c = pick(rng, candidates);
    const beat = c.result.metrics.totalReturnPct > bh.metrics.totalReturnPct;
    questions.push({
      id: "beat_the_market",
      kind: "beat_the_market",
      topic: "The benchmark",
      prompt: `${c.meta.name} returned ${pct(c.result.metrics.totalReturnPct)} on ${symbol} over these ${months} months, after brokerage. Did it beat simply buying and holding?`,
      figure: { type: "curves", series: [{ label: c.meta.name, points: normalise(c.result.equity), revealName: c.meta.name }] },
      choices: [{ label: "Yes, it beat buy and hold" }, { label: "No, buy and hold did better" }],
      answerIndex: beat ? 0 : 1,
      lesson: beat
        ? `Yes: buy and hold made ${pct(bh.metrics.totalReturnPct)} with a ${pct(-bh.metrics.maxDrawdownPct)} worst fall, so the strategy earned its activity here. One window is still one window.`
        : `No: buy and hold made ${pct(bh.metrics.totalReturnPct)}. A positive return is not an edge. Beating the thing you could have done for free is the minimum bar.`,
      evidence: [`Strategy ${pct(c.result.metrics.totalReturnPct)} · Sharpe ${num(c.result.metrics.sharpe)} · ${c.result.metrics.tradeCount} trades`, `Buy and hold ${pct(bh.metrics.totalReturnPct)} · Sharpe ${num(bh.metrics.sharpe)} · max DD ${pct(-bh.metrics.maxDrawdownPct)}`],
      labCode: labCode(c.config, period, dataVersion),
    });
  }

  // 3. Guess the drawdown.
  {
    const c = pick(rng, candidates.filter((x) => x.result.metrics.maxDrawdownPct >= 8) ?? candidates) ?? pick(rng, candidates);
    const actual = c.result.metrics.maxDrawdownPct;
    const rounded = Math.round(actual / 5) * 5;
    const distractors = new Set<number>();
    const offsets = shuffle(rng, [-20, -10, 10, 20, 30]);
    for (const o of offsets) {
      const v = rounded + o;
      if (v >= 5 && v <= 95 && v !== rounded) distractors.add(v);
      if (distractors.size === 3) break;
    }
    while (distractors.size < 3) distractors.add(rounded + 5 * (distractors.size + 4));
    const options = shuffle(rng, [rounded, ...distractors]);
    const answerIndex = options.indexOf(rounded);
    const peak = c.result.metrics.maxDrawdownPeakTime;
    const trough = c.result.metrics.maxDrawdownTroughTime;
    const fmtD = (t: number | null) => (t === null ? "" : new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }));
    questions.push({
      id: "drawdown_guess",
      kind: "drawdown_guess",
      topic: "Pain tolerance",
      prompt: `This is ${c.meta.name} on ${symbol}, ending ${pct(c.result.metrics.totalReturnPct)} after ${months} months. Roughly how big was its worst fall from a peak along the way?`,
      figure: { type: "curves", series: [{ label: c.meta.name, points: normalise(c.result.equity), revealName: c.meta.name }], hideScale: true },
      choices: options.map((o) => ({ label: `About ${o}%` })),
      answerIndex,
      lesson: `The biggest fall was ${pct(-actual)}, from ${fmtD(peak)} to ${fmtD(trough)}. The question that matters is whether you would have kept following the rules at the bottom.`,
      evidence: [`Max drawdown ${pct(-actual)} · recovered ${c.result.metrics.totalReturnPct > 0 ? "to a gain" : "only partly"} · ${c.result.metrics.maxDrawdownDurationBars} bars peak to trough`],
      labCode: labCode(c.config, period, dataVersion),
    });
  }

  // 4. Single trade outcome.
  {
    const c = pick(rng, candidates.filter((x) => x.result.trades.length >= 6)) ?? pick(rng, candidates);
    const windowCandles = candles.filter((k) => k.time >= period.start && k.time <= period.end);
    const idxOf = (time: number) => windowCandles.findIndex((k) => k.time === time);
    // Prefer trades with enough visible history before the entry to draw a meaningful chart.
    const eligible = c.result.trades.filter((t) => t.exitReason !== "end_of_data" && idxOf(t.entryTime) >= 20);
    const t = pick(rng, eligible.length ? eligible : c.result.trades);
    const entryIdx = Math.max(1, idxOf(t.entryTime));
    const from = Math.max(0, entryIdx - 60);
    const closes = windowCandles.slice(from, entryIdx + 1).map((k) => k.close);
    const won = t.pnl > 0;
    const wr = c.result.metrics.winRatePct ?? 0;
    questions.push({
      id: "trade_outcome",
      kind: "trade_outcome",
      topic: "One trade",
      prompt: `${c.meta.name} just bought ${symbol} at ${t.entryPrice.toLocaleString("en-AU", { maximumFractionDigits: 2 })} because: "${t.entryReason}" Did this trade make money?`,
      figure: { type: "price", closes, entryIndex: closes.length - 1, entryPrice: t.entryPrice, asset: symbol },
      choices: [{ label: "Yes, a winner" }, { label: "No, a loser" }],
      answerIndex: won ? 0 : 1,
      lesson: `It ${won ? "won" : "lost"} ${Math.abs(t.returnPct * 100).toFixed(1)}% and closed on "${t.exitReasonText}". Across ${c.result.metrics.tradeCount} trades this strategy won ${wr.toFixed(0)}% of the time: no single trade tells you anything.`,
      evidence: [`Exit ${t.exitPrice.toLocaleString("en-AU", { maximumFractionDigits: 2 })} after ${t.holdingBars} bars · P&L ${t.pnl >= 0 ? "+" : "-"}${Math.abs(t.pnl).toFixed(0)} ${series.currency}`, `Win rate ${wr.toFixed(0)}% · profit factor ${num(c.result.metrics.profitFactor)} · ${c.result.metrics.tradeCount} trades`],
      labCode: labCode(c.config, period, dataVersion),
    });
  }

  // 5. Risk-adjusted: which earned more per unit of risk?
  {
    const withSharpe = candidates.filter((x) => x.result.metrics.sharpe !== null);
    const pool = withSharpe.length >= 2 ? withSharpe : candidates;
    const [a, b] = shuffle(rng, pool).slice(0, 2);
    const sa = a.result.metrics.sharpe ?? a.result.metrics.totalReturnPct / Math.max(1, a.result.metrics.maxDrawdownPct);
    const sb = b.result.metrics.sharpe ?? b.result.metrics.totalReturnPct / Math.max(1, b.result.metrics.maxDrawdownPct);
    const answerIndex = sa >= sb ? 0 : 1;
    const row = (label: string, c: Candidate) => ({
      label,
      cells: [
        { key: "Return", value: pct(c.result.metrics.totalReturnPct) },
        { key: "Max drawdown", value: pct(-c.result.metrics.maxDrawdownPct) },
        { key: "Trades", value: String(c.result.metrics.tradeCount) },
      ],
    });
    questions.push({
      id: "risk_adjusted",
      kind: "risk_adjusted",
      topic: "Risk-adjusted",
      prompt: "Two strategies, same asset, same months, same costs. Which one made more money for the amount of risk it took?",
      figure: { type: "stats", rows: [row("A", a), row("B", b)] },
      choices: [{ label: "A", detail: a.meta.name }, { label: "B", detail: b.meta.name }],
      answerIndex,
      lesson: `${answerIndex === 0 ? "A" : "B"} (${(answerIndex === 0 ? a : b).meta.name}) had the higher Sharpe ratio, ${num(Math.max(sa, sb))} against ${num(Math.min(sa, sb))}. Return is what you see. The swings along the way are what you pay for it.`,
      evidence: [`A · ${a.meta.name} · Sharpe ${num(sa)}`, `B · ${b.meta.name} · Sharpe ${num(sb)}`],
      labCode: labCode((answerIndex === 0 ? a : b).config, period, dataVersion),
    });
  }

  // 6. The fee bite.
  {
    const c = [...candidates].sort((x, y) => y.result.metrics.tradeCount - x.result.metrics.tradeCount)[0];
    const feeShare = (c.result.metrics.totalFees / c.result.assumptions.initialCapital) * 100;
    const gross = c.result.metrics.totalReturnPct + feeShare;
    const netPositive = c.result.metrics.totalReturnPct > 0;
    questions.push({
      id: "fee_bite",
      kind: "fee_bite",
      topic: "Costs",
      prompt: `${c.meta.name} traded ${c.result.metrics.tradeCount} times in ${months} months. Before costs it was ${pct(gross)}. With ${c.result.assumptions.feeFixed > 0 ? `${c.result.assumptions.feeFixed} ${series.currency} brokerage per order` : `${c.result.assumptions.feeBps} bp fee`} and ${c.result.assumptions.slippageBps} bp slippage per side, is it still positive?`,
      figure: { type: "curves", series: [{ label: c.meta.name, points: normalise(c.result.equity), revealName: c.meta.name }] },
      choices: [{ label: "Yes, still positive" }, { label: "No, costs ate it" }],
      answerIndex: netPositive ? 0 : 1,
      lesson: `${netPositive ? "Yes" : "No"}: costs took ${pct(feeShare, 1)} of starting capital, leaving ${pct(c.result.metrics.totalReturnPct)}. Every extra trade is a toll, and frequent strategies pay it ${c.result.metrics.tradeCount} times.`,
      evidence: [`Gross ${pct(gross)} · costs ${pct(-feeShare)} · net ${pct(c.result.metrics.totalReturnPct)}`],
      labCode: labCode(c.config, period, dataVersion),
    });
  }

  // Keep five, dropping one of the two "yes/no" money questions so the set stays varied.
  const dropCandidates: QuizQuestion["kind"][] = ["beat_the_market", "fee_bite"];
  const drop = pick(rng, dropCandidates);
  const five = questions.filter((q) => q.kind !== drop).slice(0, QUIZ_SIZE);

  return {
    date,
    seed,
    asset: series.asset,
    symbol,
    currency: series.currency,
    timeframe: series.timeframe,
    period,
    source: series.source,
    questions: five,
  };
}

/* ------------------------------------------------------------------------- */
/* Scoring and sharing                                                        */
/* ------------------------------------------------------------------------- */

export function scoreQuiz(quiz: DailyQuiz, answers: Array<number | null>): { score: number; marks: boolean[] } {
  const marks = quiz.questions.map((q, i) => answers[i] === q.answerIndex);
  return { score: marks.filter(Boolean).length, marks };
}

export function shareText(quiz: DailyQuiz, marks: boolean[], streak: number, origin: string): string {
  const glyphs = marks.map((m) => (m ? "■" : "□")).join("");
  const date = new Date(quiz.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const streakLine = streak > 1 ? ` · ${streak}-day streak` : "";
  return `EdgeLab · Today's Five · ${date}\n${marks.filter(Boolean).length}/${QUIZ_SIZE} ${glyphs}${streakLine}\nCan you tell an edge from luck? ${origin}/daily`;
}

export function verdictForScore(score: number): { title: string; body: string } {
  if (score === QUIZ_SIZE) return { title: "Five for five", body: "Well calibrated. The habit now is to demand the same evidence from your own strategies." };
  if (score >= 3) return { title: "Better than most", body: "Most people score two or three. The misses are where overconfidence lives, so read the lessons again tomorrow." };
  if (score >= 1) return { title: "Honest score", body: "These questions are designed to be hard. The market does not reward the obvious reading of a chart." };
  return { title: "Zero is a lesson too", body: "Every intuition tested here was wrong today. That is exactly why EdgeLab tests instead of trusting." };
}
