/**
 * Statistics for judging a "best" strategy honestly.
 *
 * The deflated Sharpe ratio follows Bailey and López de Prado, "The Deflated
 * Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and
 * Non-Normality" (Journal of Portfolio Management, 2014). All Sharpe ratios
 * here are per bar (not annualised), as in the paper.
 */

const EULER_GAMMA = 0.5772156649015329;

/** Standard normal cumulative distribution (Abramowitz and Stegun 26.2.17 via erf, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0, 1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Moments {
  mean: number;
  sd: number;
  /** Skewness. */
  skew: number;
  /** Kurtosis (not excess): 3 for a normal distribution. */
  kurtosis: number;
}

export function moments(xs: readonly number[]): Moments {
  const n = xs.length;
  if (n < 2) return { mean: n ? xs[0] : 0, sd: 0, skew: 0, kurtosis: 3 };
  let m = 0;
  for (const x of xs) m += x;
  m /= n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const sd = Math.sqrt((m2 * n) / (n - 1));
  return { mean: m, sd, skew: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0, kurtosis: m2 > 0 ? m4 / (m2 * m2) : 3 };
}

/** Per-bar Sharpe ratio of a return series. */
export function perBarSharpe(returns: readonly number[]): number {
  const { mean, sd } = moments(returns);
  return sd > 0 ? mean / sd : 0;
}

/**
 * Probabilistic Sharpe ratio: the probability that the true Sharpe exceeds
 * `benchmark`, given an observed per-bar Sharpe over `bars` returns with the
 * stated skewness and kurtosis.
 */
export function probabilisticSharpe(observed: number, benchmark: number, bars: number, skew: number, kurtosis: number): number {
  const denom = 1 - skew * observed + ((kurtosis - 1) / 4) * observed * observed;
  if (bars < 2 || denom <= 0) return 0.5;
  return normalCdf(((observed - benchmark) * Math.sqrt(bars - 1)) / Math.sqrt(denom));
}

/**
 * The Sharpe ratio you would expect from the best of `trials` strategies that
 * have no skill at all, given the variance of Sharpe ratios across them.
 */
export function expectedMaxSharpe(trials: number, sharpeVariance: number): number {
  if (trials < 2 || sharpeVariance <= 0) return 0;
  return Math.sqrt(sharpeVariance) * ((1 - EULER_GAMMA) * normalInv(1 - 1 / trials) + EULER_GAMMA * normalInv(1 - 1 / (trials * Math.E)));
}

/**
 * Deflated Sharpe ratio: the probability that the selected strategy's true
 * Sharpe is above zero once you account for having picked it as the best of
 * `trials`, for the length of the sample and for fat tails.
 */
export function deflatedSharpe(args: { observed: number; trials: number; sharpeVariance: number; bars: number; skew: number; kurtosis: number }): { dsr: number; expectedMax: number } {
  const expectedMax = expectedMaxSharpe(args.trials, args.sharpeVariance);
  return { dsr: probabilisticSharpe(args.observed, expectedMax, args.bars, args.skew, args.kurtosis), expectedMax };
}
