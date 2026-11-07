/**
 * Performance metrics.
 *
 * Every metric states what it needs to be meaningful and returns null rather
 * than a misleading number when that condition is not met. The UI shows the
 * reason instead of the figure.
 */

import type { EquityPoint, PerformanceMetrics, ResultWarning, Timeframe, Trade } from "./types";
import { BARS_PER_YEAR } from "./types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Minimum period before annualised return is shown. */
export const MIN_DAYS_FOR_CAGR = 180;
/** Minimum number of per-bar returns before Sharpe or Sortino is shown. */
export const MIN_RETURNS_FOR_RATIOS = 30;
/** Below this many trades, trade statistics are flagged as unreliable. */
export const MIN_TRADES_FOR_CONFIDENCE = 30;

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation (n - 1). */
/** Variance below this is treated as zero to absorb floating-point noise. */
export const VARIANCE_EPSILON = 1e-12;

export function stdDev(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - 1));
}

export function equityReturns(equity: readonly EquityPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].equity;
    out.push(prev > 0 ? equity[i].equity / prev - 1 : 0);
  }
  return out;
}

export interface DrawdownInfo {
  maxDrawdownPct: number;
  durationBars: number;
  peakTime: number | null;
  troughTime: number | null;
  peakIndex: number;
  troughIndex: number;
}

/** Largest peak-to-trough decline of the equity curve. */
export function maxDrawdown(equity: readonly EquityPoint[]): DrawdownInfo {
  let peak = -Infinity;
  let peakIdx = 0;
  let maxDd = 0;
  let maxPeakIdx = 0;
  let maxTroughIdx = 0;
  for (let i = 0; i < equity.length; i++) {
    const e = equity[i].equity;
    if (e > peak) {
      peak = e;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
      maxPeakIdx = peakIdx;
      maxTroughIdx = i;
    }
  }
  return {
    maxDrawdownPct: maxDd * 100,
    durationBars: maxTroughIdx - maxPeakIdx,
    peakTime: equity.length ? equity[maxPeakIdx].time : null,
    troughTime: equity.length ? equity[maxTroughIdx].time : null,
    peakIndex: maxPeakIdx,
    troughIndex: maxTroughIdx,
  };
}

export function annualisedSharpe(returns: readonly number[], barsPerYear: number): number | null {
  if (returns.length < MIN_RETURNS_FOR_RATIOS) return null;
  const sd = stdDev(returns);
  if (sd < VARIANCE_EPSILON) return null;
  return (mean(returns) / sd) * Math.sqrt(barsPerYear);
}

export function annualisedSortino(returns: readonly number[], barsPerYear: number): number | null {
  if (returns.length < MIN_RETURNS_FOR_RATIOS) return null;
  let downsideSq = 0;
  for (const r of returns) if (r < 0) downsideSq += r * r;
  const downside = Math.sqrt(downsideSq / returns.length);
  if (downside < VARIANCE_EPSILON) return null;
  return (mean(returns) / downside) * Math.sqrt(barsPerYear);
}

export function cagr(startEquity: number, endEquity: number, startTime: number, endTime: number): number | null {
  const years = (endTime - startTime) / MS_PER_YEAR;
  if (years * 365.25 < MIN_DAYS_FOR_CAGR || startEquity <= 0 || endEquity <= 0) return null;
  return (Math.pow(endEquity / startEquity, 1 / years) - 1) * 100;
}

export function maxConsecutiveLosses(trades: readonly Trade[]): number {
  let run = 0;
  let best = 0;
  for (const t of trades) {
    if (t.pnl < 0) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

export function computeMetrics(
  equity: readonly EquityPoint[],
  trades: readonly Trade[],
  timeframe: Timeframe,
  initialCapital: number,
): { metrics: PerformanceMetrics; warnings: ResultWarning[] } {
  const warnings: ResultWarning[] = [];
  const barsPerYear = BARS_PER_YEAR[timeframe];
  const finalEquity = equity.length ? equity[equity.length - 1].equity : initialCapital;
  const totalReturnPct = initialCapital > 0 ? (finalEquity / initialCapital - 1) * 100 : 0;
  const returns = equityReturns(equity);
  const dd = maxDrawdown(equity);

  const startTime = equity.length ? equity[0].time : 0;
  const endTime = equity.length ? equity[equity.length - 1].time : 0;
  const cagrPct = cagr(initialCapital, finalEquity, startTime, endTime);
  if (cagrPct === null && equity.length > 0) {
    warnings.push({
      code: "annualisation_unreliable",
      severity: "info",
      message: `Annualised return is hidden because the period is shorter than ${MIN_DAYS_FOR_CAGR} days.`,
    });
  }

  const sd = stdDev(returns);
  const sharpe = annualisedSharpe(returns, barsPerYear);
  const sortino = annualisedSortino(returns, barsPerYear);
  if (returns.length >= MIN_RETURNS_FOR_RATIOS && sd < VARIANCE_EPSILON) {
    warnings.push({
      code: "zero_variance",
      severity: "info",
      message: "Equity never changed, so risk-adjusted ratios are undefined.",
    });
  } else if (returns.length < MIN_RETURNS_FOR_RATIOS) {
    warnings.push({
      code: "insufficient_history",
      severity: "warning",
      message: `Fewer than ${MIN_RETURNS_FOR_RATIOS} bars: Sharpe and Sortino are not shown.`,
    });
  }
  const volatilityPct = returns.length >= MIN_RETURNS_FOR_RATIOS ? sd * Math.sqrt(barsPerYear) * 100 : null;
  const calmar = cagrPct !== null && dd.maxDrawdownPct > 0 ? cagrPct / dd.maxDrawdownPct : null;

  const tradeCount = trades.length;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  const winRatePct = tradeCount > 0 ? (wins.length / tradeCount) * 100 : null;
  let profitFactor: number | null = null;
  if (tradeCount > 0) {
    if (grossLoss > 0) profitFactor = grossProfit / grossLoss;
    else if (grossProfit > 0) profitFactor = Infinity;
  }
  const avgTradeReturnPct = tradeCount > 0 ? mean(trades.map((t) => t.returnPct)) * 100 : null;
  const avgWinPct = wins.length ? mean(wins.map((t) => t.returnPct)) * 100 : null;
  const avgLossPct = losses.length ? mean(losses.map((t) => t.returnPct)) * 100 : null;
  const avgHoldingBars = tradeCount > 0 ? mean(trades.map((t) => t.holdingBars)) : null;
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);

  let exposedBars = 0;
  for (const p of equity) if (p.exposure > 0.0001) exposedBars++;
  const exposurePct = equity.length ? (exposedBars / equity.length) * 100 : 0;

  if (tradeCount === 0) {
    warnings.push({ code: "no_trades", severity: "warning", message: "The strategy never traded in this period. Nothing can be concluded." });
  } else if (tradeCount < MIN_TRADES_FOR_CONFIDENCE) {
    warnings.push({
      code: "insufficient_trades",
      severity: "warning",
      message: `Only ${tradeCount} trade${tradeCount === 1 ? "" : "s"}. Fewer than ${MIN_TRADES_FOR_CONFIDENCE} trades is too small a sample to trust win rate or profit factor.`,
    });
  }

  return {
    metrics: {
      totalReturnPct,
      cagrPct,
      maxDrawdownPct: dd.maxDrawdownPct,
      maxDrawdownDurationBars: dd.durationBars,
      maxDrawdownPeakTime: dd.peakTime,
      maxDrawdownTroughTime: dd.troughTime,
      sharpe,
      sortino,
      volatilityPct,
      calmar,
      tradeCount,
      winRatePct,
      profitFactor,
      avgTradeReturnPct,
      avgWinPct,
      avgLossPct,
      avgHoldingBars,
      exposurePct,
      totalFees,
      maxConsecutiveLosses: maxConsecutiveLosses(trades),
      finalEquity,
    },
    warnings,
  };
}

/** Definitions shown next to each metric in the UI. */
export const METRIC_DEFINITIONS: Record<keyof PerformanceMetrics, { label: string; plain: string; caveat?: string }> = {
  totalReturnPct: { label: "Total return", plain: "How much the portfolio grew or shrank over the whole period, after fees and slippage." },
  cagrPct: {
    label: "Annualised return",
    plain: "The steady yearly growth rate that would produce the same result.",
    caveat: `Hidden for periods under ${MIN_DAYS_FOR_CAGR} days, where it exaggerates.`,
  },
  maxDrawdownPct: { label: "Max drawdown", plain: "The biggest fall your portfolio experienced from a previous high." },
  maxDrawdownDurationBars: { label: "Drawdown length", plain: "How many bars the biggest fall took from peak to trough." },
  maxDrawdownPeakTime: { label: "Drawdown peak", plain: "When the biggest fall began." },
  maxDrawdownTroughTime: { label: "Drawdown trough", plain: "When the biggest fall bottomed." },
  sharpe: {
    label: "Sharpe ratio",
    plain: "Is the strategy making money for the amount of risk it takes? Above 1 is good; above 2 is rare and deserves suspicion.",
    caveat: "Assumes returns are roughly normal, which crypto returns are not. Treat as a rough guide.",
  },
  sortino: { label: "Sortino ratio", plain: "Like Sharpe, but only counts downside swings as risk." },
  volatilityPct: { label: "Volatility", plain: "How much the portfolio value swings in a typical year." },
  calmar: { label: "Calmar ratio", plain: "Annualised return divided by the worst drawdown. Return earned per unit of pain." },
  tradeCount: { label: "Trades", plain: "How many completed round trips. Fewer than 30 is a small sample." },
  winRatePct: { label: "Win rate", plain: "The share of trades that made money. A high win rate with small wins and large losses still loses." },
  profitFactor: { label: "Profit factor", plain: "Total profit from winners divided by total loss from losers. Above 1 means net profitable." },
  avgTradeReturnPct: { label: "Avg trade", plain: "Average return per trade after costs." },
  avgWinPct: { label: "Avg win", plain: "Average return of the winning trades." },
  avgLossPct: { label: "Avg loss", plain: "Average return of the losing trades." },
  avgHoldingBars: { label: "Avg holding", plain: "How long a typical position was held." },
  exposurePct: { label: "Market exposure", plain: "The share of time the strategy was invested rather than in cash." },
  totalFees: { label: "Fees paid", plain: "Total fees and slippage cost in quote currency." },
  maxConsecutiveLosses: { label: "Worst losing streak", plain: "The most losing trades in a row. Could you keep following the rules through it?" },
  finalEquity: { label: "Final equity", plain: "Portfolio value at the end of the period." },
};
