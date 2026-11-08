/**
 * Validation: the tools that separate a real edge from a lucky backtest.
 *
 *  - splitPeriod: train / validation / test by time, never by shuffling.
 *  - walkForward: optimise on a rolling window, test on the next one, stitch
 *    the out-of-sample segments together.
 *  - sensitivity: perturb each parameter around the chosen value and record
 *    the metric surface. A real edge is a plateau; an overfit one is a spike.
 *  - regimes: classify bars by trend and volatility and report performance
 *    inside each.
 *  - assessOverfitting: turn all of the above into plain-English findings.
 */

import type { StrategyConfig, StrategyParams } from "@/lib/strategies/schema";
import { runBacktest } from "./backtest";
import { closes, rollingStd, simpleReturns, sma } from "./indicators";
import { computeMetrics, MIN_TRADES_FOR_CONFIDENCE } from "./metrics";
import type { BacktestResult, CandleSeries, EquityPoint, PerformanceMetrics, Timeframe } from "./types";
import { BARS_PER_YEAR } from "./types";

/* ------------------------------------------------------------------------- */
/* Period splitting                                                           */
/* ------------------------------------------------------------------------- */

export interface Period {
  start: number;
  end: number;
}

export interface Split {
  train: Period;
  validation: Period;
  test: Period;
}

/** Split a period into train/validation/test by fractions, in time order. */
export function splitPeriod(start: number, end: number, fractions: [number, number, number] = [0.6, 0.2, 0.2]): Split {
  const total = fractions[0] + fractions[1] + fractions[2];
  const span = end - start;
  const a = start + (span * fractions[0]) / total;
  const b = a + (span * fractions[1]) / total;
  return {
    train: { start, end: Math.floor(a) },
    validation: { start: Math.floor(a) + 1, end: Math.floor(b) },
    test: { start: Math.floor(b) + 1, end },
  };
}

/* ------------------------------------------------------------------------- */
/* Parameter grids                                                            */
/* ------------------------------------------------------------------------- */

export interface NumericParam {
  key: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

/** Numeric parameters a strategy exposes for optimisation and sensitivity analysis. */
export function tunableParams(params: StrategyParams): NumericParam[] {
  switch (params.kind) {
    case "ma_crossover":
      return [
        { key: "fast", value: params.fast, min: 2, max: 200, step: 1, integer: true },
        { key: "slow", value: params.slow, min: 3, max: 400, step: 1, integer: true },
      ];
    case "rsi_mean_reversion":
      return [
        { key: "period", value: params.period, min: 2, max: 100, step: 1, integer: true },
        { key: "oversold", value: params.oversold, min: 1, max: 50, step: 1, integer: false },
        { key: "overbought", value: params.overbought, min: 50, max: 99, step: 1, integer: false },
      ];
    case "macd_momentum":
      return [
        { key: "fast", value: params.fast, min: 2, max: 100, step: 1, integer: true },
        { key: "slow", value: params.slow, min: 3, max: 200, step: 1, integer: true },
        { key: "signal", value: params.signal, min: 2, max: 100, step: 1, integer: true },
      ];
    case "breakout":
      return [
        { key: "lookback", value: params.lookback, min: 5, max: 400, step: 1, integer: true },
        { key: "exitLookback", value: params.exitLookback, min: 2, max: 400, step: 1, integer: true },
      ];
    case "trend_following":
      return [
        { key: "maPeriod", value: params.maPeriod, min: 5, max: 400, step: 1, integer: true },
        { key: "atrMultiple", value: params.atrMultiple, min: 0.5, max: 10, step: 0.1, integer: false },
      ];
    case "volatility_breakout":
      return [
        { key: "atrMultiple", value: params.atrMultiple, min: 0.1, max: 5, step: 0.1, integer: false },
        { key: "holdBars", value: params.holdBars, min: 1, max: 200, step: 1, integer: true },
      ];
    case "momentum_rotation":
      return [
        { key: "lookback", value: params.lookback, min: 5, max: 400, step: 1, integer: true },
        { key: "rebalanceBars", value: params.rebalanceBars, min: 1, max: 200, step: 1, integer: true },
      ];
    case "tsmom":
      return [{ key: "lookback", value: params.lookback, min: 5, max: 1000, step: 1, integer: true }];
    case "buy_and_hold":
    case "random_baseline":
      return [];
  }
}

export function withParam(config: StrategyConfig, key: string, value: number): StrategyConfig {
  const params = { ...config.params, [key]: value } as StrategyParams;
  return { ...config, params };
}

function clampParam(p: NumericParam, v: number): number {
  const c = Math.min(p.max, Math.max(p.min, v));
  return p.integer ? Math.round(c) : Math.round(c * 1000) / 1000;
}

/** Candidate values around the current value: the value itself and ±{10,20,35,50}%. */
export function neighbourhood(p: NumericParam, spread: number[] = [-0.5, -0.35, -0.2, -0.1, 0, 0.1, 0.2, 0.35, 0.5]): number[] {
  const out = new Set<number>();
  for (const s of spread) {
    const v = clampParam(p, p.value * (1 + s));
    out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function isValid(config: StrategyConfig): boolean {
  const p = config.params;
  if ((p.kind === "ma_crossover" || p.kind === "macd_momentum") && p.fast >= p.slow) return false;
  if (p.kind === "rsi_mean_reversion" && p.oversold >= p.overbought) return false;
  return true;
}

/* ------------------------------------------------------------------------- */
/* Objective                                                                  */
/* ------------------------------------------------------------------------- */

export type Objective = "sharpe" | "calmar" | "totalReturn";

/** Score a result for optimisation. Falls back gracefully when a ratio is undefined. */
export function objectiveScore(m: PerformanceMetrics, objective: Objective): number {
  switch (objective) {
    case "sharpe":
      return m.sharpe ?? (m.tradeCount === 0 ? -Infinity : -10);
    case "calmar":
      return m.calmar ?? (m.maxDrawdownPct > 0 ? m.totalReturnPct / m.maxDrawdownPct : m.totalReturnPct);
    case "totalReturn":
      return m.totalReturnPct;
  }
}

/* ------------------------------------------------------------------------- */
/* Walk-forward                                                               */
/* ------------------------------------------------------------------------- */

export interface WalkForwardFold {
  train: Period;
  test: Period;
  /** Best parameters found on the training window. */
  chosen: StrategyParams;
  trainMetrics: PerformanceMetrics;
  testMetrics: PerformanceMetrics;
  testResult: BacktestResult;
}

export interface WalkForwardReport {
  folds: WalkForwardFold[];
  /** Equity of the stitched out-of-sample segments, rebased to the initial capital. */
  stitchedEquity: EquityPoint[];
  stitchedMetrics: PerformanceMetrics;
  /** Original (in-sample, user-chosen parameters) metrics over the same whole span, for comparison. */
  inSampleMetrics: PerformanceMetrics;
  objective: Objective;
  evaluations: number;
}

export interface WalkForwardOptions {
  folds?: number;
  /** Share of each fold used for training. */
  trainFraction?: number;
  objective?: Objective;
  /** Maximum backtests to run per fold while searching parameters. */
  maxEvaluationsPerFold?: number;
}

/** Enumerate a coarse grid over the tunable parameters, capped at `max` combinations. */
export function parameterGrid(config: StrategyConfig, max: number): StrategyConfig[] {
  const params = tunableParams(config.params);
  if (params.length === 0) return [config];
  const perParam = Math.max(2, Math.floor(Math.pow(max, 1 / params.length)));
  const spreads = perParam >= 5 ? [-0.5, -0.25, 0, 0.25, 0.5] : perParam >= 3 ? [-0.35, 0, 0.35] : [-0.25, 0.25];
  const candidates: StrategyConfig[] = [];
  const recurse = (idx: number, current: StrategyConfig) => {
    if (idx === params.length) {
      if (isValid(current)) candidates.push(current);
      return;
    }
    const p = params[idx];
    const values = new Set<number>();
    for (const s of spreads) values.add(clampParam(p, p.value * (1 + s)));
    for (const v of values) recurse(idx + 1, withParam(current, p.key, v));
  };
  recurse(0, config);
  return candidates.slice(0, max);
}

export function walkForward(config: StrategyConfig, series: CandleSeries[], period: Period, options: WalkForwardOptions = {}): WalkForwardReport {
  const foldCount = options.folds ?? 4;
  const trainFraction = options.trainFraction ?? 0.7;
  const objective = options.objective ?? "sharpe";
  const maxEval = options.maxEvaluationsPerFold ?? 24;

  const span = period.end - period.start;
  const foldSpan = span / foldCount;
  const folds: WalkForwardFold[] = [];
  const grid = parameterGrid(config, maxEval);
  let evaluations = 0;

  const stitched: EquityPoint[] = [];
  let scale = 1;

  for (let f = 0; f < foldCount; f++) {
    const foldStart = Math.floor(period.start + f * foldSpan);
    const foldEnd = f === foldCount - 1 ? period.end : Math.floor(period.start + (f + 1) * foldSpan) - 1;
    const trainEnd = Math.floor(foldStart + (foldEnd - foldStart) * trainFraction);
    const train = { start: foldStart, end: trainEnd };
    const test = { start: trainEnd + 1, end: foldEnd };

    let best: { config: StrategyConfig; metrics: PerformanceMetrics; score: number } | null = null;
    for (const candidate of grid) {
      try {
        const r = runBacktest(candidate, series, { start: train.start, end: train.end });
        evaluations++;
        const score = objectiveScore(r.metrics, objective);
        if (!best || score > best.score) best = { config: candidate, metrics: r.metrics, score };
      } catch {
        // A candidate that cannot run on this window is simply skipped.
      }
    }
    if (!best) continue;
    const testResult = runBacktest(best.config, series, { start: test.start, end: test.end });
    evaluations++;
    folds.push({ train, test, chosen: best.config.params, trainMetrics: best.metrics, testMetrics: testResult.metrics, testResult });

    // Stitch: rebase this fold's equity to continue from the previous fold's end.
    const base = testResult.equity.length ? testResult.equity[0].equity : config.initialCapital;
    for (const p of testResult.equity) {
      stitched.push({ ...p, equity: (p.equity / base) * scale * config.initialCapital, cash: 0 });
    }
    if (testResult.equity.length) scale *= testResult.equity[testResult.equity.length - 1].equity / base;
  }

  // Recompute drawdown over the stitched curve.
  let peak = -Infinity;
  for (const p of stitched) {
    if (p.equity > peak) peak = p.equity;
    p.drawdown = peak > 0 ? (peak - p.equity) / peak : 0;
  }
  const allTestTrades = folds.flatMap((f) => f.testResult.trades);
  const stitchedMetrics = computeMetrics(stitched, allTestTrades, config.timeframe, config.initialCapital).metrics;
  const inSample = runBacktest(config, series, { start: period.start, end: period.end });

  return { folds, stitchedEquity: stitched, stitchedMetrics, inSampleMetrics: inSample.metrics, objective, evaluations };
}

/* ------------------------------------------------------------------------- */
/* Sensitivity                                                                */
/* ------------------------------------------------------------------------- */

export interface SensitivityPoint {
  value: number;
  metrics: PerformanceMetrics | null;
}

export interface SensitivityReport {
  param: NumericParam;
  points: SensitivityPoint[];
  /** Fraction of neighbouring points that keep at least half of the chosen point's score. 1 = robust plateau. */
  stability: number;
}

export function sensitivity(config: StrategyConfig, series: CandleSeries[], period: Period, objective: Objective = "sharpe"): SensitivityReport[] {
  const params = tunableParams(config.params);
  const reports: SensitivityReport[] = [];
  for (const p of params) {
    const points: SensitivityPoint[] = [];
    for (const v of neighbourhood(p)) {
      const candidate = withParam(config, p.key, v);
      if (!isValid(candidate)) {
        points.push({ value: v, metrics: null });
        continue;
      }
      try {
        points.push({ value: v, metrics: runBacktest(candidate, series, period).metrics });
      } catch {
        points.push({ value: v, metrics: null });
      }
    }
    const chosen = points.find((pt) => pt.value === clampParam(p, p.value))?.metrics ?? null;
    const chosenScore = chosen ? objectiveScore(chosen, objective) : 0;
    const neighbours = points.filter((pt) => pt.value !== clampParam(p, p.value) && pt.metrics);
    const robust = neighbours.filter((pt) => {
      const s = objectiveScore(pt.metrics!, objective);
      if (chosenScore <= 0) return s >= chosenScore;
      return s >= chosenScore * 0.5;
    });
    reports.push({ param: p, points, stability: neighbours.length ? robust.length / neighbours.length : 1 });
  }
  return reports;
}

/* ------------------------------------------------------------------------- */
/* Regimes                                                                    */
/* ------------------------------------------------------------------------- */

export type Regime = "uptrend" | "downtrend" | "sideways" | "high_volatility";

export const REGIME_LABELS: Record<Regime, string> = {
  uptrend: "Uptrend",
  downtrend: "Downtrend",
  sideways: "Sideways",
  high_volatility: "High volatility",
};

export interface RegimePerformance {
  regime: Regime;
  bars: number;
  sharePct: number;
  /** Strategy return inside this regime, compounded over its bars. */
  strategyReturnPct: number;
  /** Asset return inside this regime (the first asset). */
  marketReturnPct: number;
  exposurePct: number;
}

/**
 * Classify each bar of a candle series. The classification at bar i uses only
 * bars up to i (trailing windows), so it is safe to use alongside signals.
 */
export function classifyRegimes(series: CandleSeries, trendWindow = 50, volWindow = 30): (Regime | null)[] {
  const c = closes(series.candles);
  const trend = sma(c, trendWindow);
  const rets = simpleReturns(c);
  const vol = rollingStd(rets, volWindow);
  const longVol = rollingStd(rets, volWindow * 4);
  const out: (Regime | null)[] = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    const t = trend[i];
    const v = vol[i];
    const lv = longVol[i];
    const tPrev = trend[i - Math.floor(trendWindow / 2)];
    if (t === null || v === null || tPrev === null || tPrev === undefined) continue;
    if (lv !== null && v > lv * 1.6) {
      out[i] = "high_volatility";
      continue;
    }
    const slope = t / tPrev - 1;
    const threshold = (v ?? 0) * Math.sqrt(trendWindow / 2) * 0.5;
    if (slope > threshold) out[i] = "uptrend";
    else if (slope < -threshold) out[i] = "downtrend";
    else out[i] = "sideways";
  }
  return out;
}

export function regimePerformance(result: BacktestResult, series: CandleSeries): RegimePerformance[] {
  const regimes = classifyRegimes(series);
  const byTime = new Map<number, number>();
  series.candles.forEach((c, i) => byTime.set(c.time, i));
  const acc = new Map<Regime, { bars: number; strat: number; market: number; exposed: number }>();
  for (let i = 1; i < result.equity.length; i++) {
    const p = result.equity[i];
    const idx = byTime.get(p.time);
    if (idx === undefined) continue;
    const r = regimes[idx];
    if (!r) continue;
    const prevEq = result.equity[i - 1].equity;
    const stratRet = prevEq > 0 ? p.equity / prevEq : 1;
    const prevClose = series.candles[idx - 1]?.close ?? series.candles[idx].close;
    const marketRet = prevClose > 0 ? series.candles[idx].close / prevClose : 1;
    const a = acc.get(r) ?? { bars: 0, strat: 1, market: 1, exposed: 0 };
    a.bars++;
    a.strat *= stratRet;
    a.market *= marketRet;
    if (p.exposure > 0.0001) a.exposed++;
    acc.set(r, a);
  }
  const total = [...acc.values()].reduce((s, a) => s + a.bars, 0);
  const order: Regime[] = ["uptrend", "downtrend", "sideways", "high_volatility"];
  return order
    .filter((r) => acc.has(r))
    .map((regime) => {
      const a = acc.get(regime)!;
      return {
        regime,
        bars: a.bars,
        sharePct: total ? (a.bars / total) * 100 : 0,
        strategyReturnPct: (a.strat - 1) * 100,
        marketReturnPct: (a.market - 1) * 100,
        exposurePct: a.bars ? (a.exposed / a.bars) * 100 : 0,
      };
    });
}

/* ------------------------------------------------------------------------- */
/* Overfitting assessment                                                     */
/* ------------------------------------------------------------------------- */

export type Verdict = "unproven" | "fragile" | "promising" | "robust";

export interface Finding {
  severity: "good" | "info" | "warning" | "critical";
  title: string;
  detail: string;
}

export interface EdgeAssessment {
  verdict: Verdict;
  headline: string;
  findings: Finding[];
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  unproven: "Edge unproven",
  fragile: "Edge fragile",
  promising: "Edge promising",
  robust: "Edge survives testing",
};

export function assessEdge(args: {
  result: BacktestResult;
  benchmark: BacktestResult | null;
  walkForward: WalkForwardReport | null;
  sensitivity: SensitivityReport[];
  regimes: RegimePerformance[];
  timeframe: Timeframe;
}): EdgeAssessment {
  const { result, benchmark, walkForward: wf, sensitivity: sens, regimes } = args;
  const findings: Finding[] = [];
  let score = 0;
  const m = result.metrics;

  // Sample size.
  if (m.tradeCount === 0) {
    findings.push({ severity: "critical", title: "No trades", detail: "The strategy never traded. There is nothing to evaluate." });
    return { verdict: "unproven", headline: "No trades were made in this period.", findings };
  }
  if (m.tradeCount < MIN_TRADES_FOR_CONFIDENCE) {
    findings.push({
      severity: "warning",
      title: `Only ${m.tradeCount} trades`,
      detail: `With fewer than ${MIN_TRADES_FOR_CONFIDENCE} trades, a handful of lucky entries can dominate the result. Test a longer period or a faster timeframe before trusting it.`,
    });
    score -= 1;
  } else {
    score += 1;
  }

  const days = (result.period.end - result.period.start) / 86_400_000;
  if (days < 365) {
    findings.push({ severity: "warning", title: "Less than a year of data", detail: `The test covers ${Math.round(days)} days. That is unlikely to include every kind of market.` });
    score -= 1;
  }

  // Benchmark comparison.
  if (benchmark) {
    const b = benchmark.metrics;
    const beatsReturn = m.totalReturnPct > b.totalReturnPct;
    const beatsRisk = (m.sharpe ?? -Infinity) > (b.sharpe ?? -Infinity);
    const lessDrawdown = m.maxDrawdownPct < b.maxDrawdownPct;
    if (beatsReturn && beatsRisk) {
      findings.push({ severity: "good", title: "Beats buy and hold on return and risk", detail: `Return ${fmtPct(m.totalReturnPct)} vs ${fmtPct(b.totalReturnPct)}; Sharpe ${fmtNum(m.sharpe)} vs ${fmtNum(b.sharpe)}.` });
      score += 2;
    } else if (beatsRisk || lessDrawdown) {
      findings.push({
        severity: "info",
        title: "Lower risk than buy and hold, not higher return",
        detail: `Return ${fmtPct(m.totalReturnPct)} vs ${fmtPct(b.totalReturnPct)}, but max drawdown ${fmtPct(m.maxDrawdownPct)} vs ${fmtPct(b.maxDrawdownPct)}. That can be a legitimate edge if the risk reduction is what you want.`,
      });
      score += 1;
    } else {
      findings.push({
        severity: "critical",
        title: "Does not beat buy and hold",
        detail: `Buy and hold returned ${fmtPct(b.totalReturnPct)} with Sharpe ${fmtNum(b.sharpe)}; this strategy returned ${fmtPct(m.totalReturnPct)} with Sharpe ${fmtNum(m.sharpe)}. The activity is not paying for itself.`,
      });
      score -= 2;
    }
  }

  // Fees.
  if (m.totalFees > 0) {
    const feeShare = m.totalFees / result.assumptions.initialCapital;
    const grossReturn = m.totalReturnPct / 100 + feeShare;
    if (grossReturn > 0 && feeShare > grossReturn * 0.5) {
      findings.push({
        severity: "warning",
        title: "Fees eat most of the gross profit",
        detail: `Costs totalled ${fmtPct(feeShare * 100)} of starting capital against a gross return of ${fmtPct(grossReturn * 100)}. Small changes in fee assumptions could flip the result.`,
      });
      score -= 1;
    }
  }

  // Walk-forward.
  if (wf && wf.folds.length >= 2) {
    const isSharpe = wf.inSampleMetrics.sharpe;
    const oosSharpe = wf.stitchedMetrics.sharpe;
    if (isSharpe !== null && oosSharpe !== null) {
      const degradation = isSharpe > 0 ? 1 - oosSharpe / isSharpe : 0;
      if (oosSharpe <= 0) {
        findings.push({ severity: "critical", title: "Fails out of sample", detail: `Sharpe was ${fmtNum(isSharpe)} on the chosen parameters but ${fmtNum(oosSharpe)} when parameters were re-chosen on past data only. This is the signature of overfitting.` });
        score -= 2;
      } else if (degradation > 0.5) {
        findings.push({ severity: "warning", title: "Large out-of-sample degradation", detail: `Out-of-sample Sharpe ${fmtNum(oosSharpe)} is ${Math.round(degradation * 100)}% below in-sample ${fmtNum(isSharpe)}. Some of the in-sample result was luck or tuning.` });
        score -= 1;
      } else {
        findings.push({ severity: "good", title: "Holds up out of sample", detail: `Out-of-sample Sharpe ${fmtNum(oosSharpe)} vs in-sample ${fmtNum(isSharpe)} across ${wf.folds.length} walk-forward folds.` });
        score += 2;
      }
    } else {
      findings.push({ severity: "info", title: "Walk-forward inconclusive", detail: "Too few bars or trades in the test windows to compare risk-adjusted performance." });
    }
    const positiveFolds = wf.folds.filter((f) => f.testMetrics.totalReturnPct > 0).length;
    findings.push({
      severity: positiveFolds >= wf.folds.length * 0.75 ? "good" : positiveFolds >= wf.folds.length / 2 ? "info" : "warning",
      title: `${positiveFolds} of ${wf.folds.length} test windows profitable`,
      detail: "Each window re-optimised parameters on the preceding data only, then traded them forward.",
    });
  }

  // Sensitivity.
  if (sens.length) {
    const avgStability = sens.reduce((s, r) => s + r.stability, 0) / sens.length;
    const fragile = sens.filter((r) => r.stability < 0.5);
    if (fragile.length) {
      findings.push({
        severity: "warning",
        title: `Sensitive to ${fragile.map((f) => f.param.key).join(", ")}`,
        detail: "Nearby parameter values perform much worse. A real edge is usually a plateau, not a spike at one exact setting.",
      });
      score -= 1;
    } else if (avgStability >= 0.75) {
      findings.push({ severity: "good", title: "Stable across nearby parameters", detail: `${Math.round(avgStability * 100)}% of neighbouring parameter values keep at least half the performance.` });
      score += 1;
    }
  }

  // Regimes.
  if (regimes.length >= 2) {
    const losers = regimes.filter((r) => r.strategyReturnPct < 0 && r.sharePct >= 10);
    const winnersOnlyUp = regimes.every((r) => (r.regime === "uptrend" ? r.strategyReturnPct > 0 : r.strategyReturnPct <= 0));
    if (winnersOnlyUp && regimes.some((r) => r.regime === "uptrend")) {
      findings.push({ severity: "warning", title: "Only makes money in uptrends", detail: "The strategy's gains all came from rising markets. Check whether it is doing anything buy and hold would not." });
      score -= 1;
    } else if (losers.length) {
      findings.push({
        severity: "info",
        title: `Loses in ${losers.map((l) => REGIME_LABELS[l.regime].toLowerCase()).join(" and ")}`,
        detail: "Know which conditions hurt this strategy before paper trading it.",
      });
    } else {
      findings.push({ severity: "good", title: "Positive in every regime it traded", detail: "Gains were not concentrated in one kind of market." });
      score += 1;
    }
  }

  let verdict: Verdict;
  if (score >= 5) verdict = "robust";
  else if (score >= 2) verdict = "promising";
  else if (score >= -1) verdict = "fragile";
  else verdict = "unproven";

  const headline = {
    robust: "The edge survived out-of-sample testing, parameter perturbation and regime analysis. Paper trade it before believing it.",
    promising: "Some evidence of an edge. The weaknesses listed below are where it could fall apart.",
    fragile: "The result depends on specific choices. Treat it as a hypothesis, not a finding.",
    unproven: "The evidence does not support an edge. Do not trade this.",
  }[verdict];

  return { verdict, headline, findings };
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtNum(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "n/a";
  return v.toFixed(2);
}

/** Bars in a period for a timeframe, for sample-size messaging. */
export function barsInPeriod(period: Period, timeframe: Timeframe): number {
  return Math.floor(((period.end - period.start) / (365 * 86_400_000)) * BARS_PER_YEAR[timeframe]);
}
