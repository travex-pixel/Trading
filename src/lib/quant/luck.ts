/**
 * "Could luck have done this?" A permutation test for the best of several
 * strategies.
 *
 * Each strategy is reduced to its exposure path: how much of the account was
 * in the market at each close. Rotating that path to another starting point
 * (a circular shift) keeps exactly the same time in the market, number of
 * trades and holding periods, but breaks any link between the strategy's
 * timing and what prices did next.
 *
 * All N strategies are rotated by the same amount, so the luck-only set keeps
 * the real set's correlations, as in White's Reality Check and Hansen's SPA
 * test. (Rotating each one independently made the luck-only strategies
 * independent while the real ones are highly correlated, which inflated the
 * luck-only best and biased the test towards "luck explains it": p-values on
 * real and demo data averaged 0.60 to 0.66 instead of 0.5.) Every distinct
 * rotation is tried, so the p-value is exact and deterministic: the share of
 * rotations whose best strategy does at least as well as the real winner.
 *
 * The observed strategies are scored with exactly the same replay as the
 * rotated ones, so the comparison is like for like.
 */

import type { BacktestResult, Candle } from "./types";

export interface LuckTestResult {
  /** Probability that luck-only timing produces a best-of-N at least this good. */
  pValue: number;
  /** Best per-bar Sharpe among the real strategies, on the replay. */
  observedBest: number;
  /** Median best-of-N Sharpe from luck alone, per bar. */
  luckMedian: number;
  /** 95th percentile of the best-of-N Sharpe from luck alone, per bar. */
  luck95: number;
  simulations: number;
  strategies: number;
}

/** Exposure at each close of the result's window, 0 to 1. */
export function exposurePath(result: BacktestResult): number[] {
  return result.equity.map((p) => p.exposure);
}

/**
 * Per-bar returns of holding `exposure[t-1]` of the account over bar t's
 * close-to-close move, paying `costRate` on every change in exposure.
 */
export function replayReturns(closes: readonly number[], exposure: readonly number[], costRate: number, shift = 0): number[] {
  const n = closes.length;
  const out = new Array<number>(n - 1);
  const at = (i: number) => exposure[(i + shift) % n];
  let prev = at(0);
  for (let t = 1; t < n; t++) {
    const held = prev;
    const r = closes[t] / closes[t - 1] - 1;
    const next = at(t);
    out[t - 1] = held * r - costRate * Math.abs(next - held);
    prev = next;
  }
  return out;
}

/** Per-bar Sharpe of the replay, in one pass with no allocation. Same arithmetic as replayReturns. */
function replaySharpe(ret: Float64Array, exposure: readonly number[], costRate: number, shift: number): number {
  const n = exposure.length;
  let idx = shift % n;
  let prev = exposure[idx];
  let sum = 0;
  let sumSq = 0;
  for (let t = 1; t < n; t++) {
    idx = idx + 1 === n ? 0 : idx + 1;
    const next = exposure[idx];
    const x = prev * ret[t] - costRate * Math.abs(next - prev);
    sum += x;
    sumSq += x * x;
    prev = next;
  }
  const m = n - 1;
  const mean = sum / m;
  const variance = (sumSq - m * mean * mean) / (m - 1);
  return variance > 0 ? mean / Math.sqrt(variance) : 0;
}

export function luckTest(args: {
  results: BacktestResult[];
  /** Candles covering exactly the results' window, aligned to their equity points. */
  candles: Candle[];
  /** Cap on rotations tried. By default every distinct rotation is used. */
  simulations?: number;
  /** Unused since rotations are enumerated. Kept for call-site compatibility. */
  seed?: number;
}): LuckTestResult | null {
  const { results, candles } = args;
  const sims = args.simulations ?? Number.MAX_SAFE_INTEGER;
  const n = candles.length;
  if (results.length === 0 || n < 30) return null;
  const closes = candles.map((c) => c.close);
  const paths = results.map((r) => exposurePath(r));
  if (paths.some((p) => p.length !== n)) return null;
  const a = results[0].assumptions;
  // Proportional cost per unit of exposure changed: slippage and fee per side, plus the flat brokerage on the starting capital.
  const costRate = (a.feeBps + a.slippageBps) / 10_000 + (a.feeFixed ?? 0) / a.initialCapital;

  const ret = new Float64Array(n);
  for (let t = 1; t < n; t++) ret[t] = closes[t] / closes[t - 1] - 1;
  const observedBest = Math.max(...paths.map((p) => replaySharpe(ret, p, costRate, 0)));
  // Every distinct common rotation, or an evenly spaced subset of `simulations` of them.
  const rotations = Math.min(n - 1, sims);
  const best = new Float64Array(rotations);
  let atLeast = 0;
  for (let s = 0; s < rotations; s++) {
    const shift = 1 + Math.floor((s * (n - 1)) / rotations);
    let m = -Infinity;
    for (const p of paths) {
      const sh = replaySharpe(ret, p, costRate, shift);
      if (sh > m) m = sh;
    }
    best[s] = m;
    if (m >= observedBest - 1e-12) atLeast++;
  }
  const sorted = Array.from(best).sort((x, y) => x - y);
  return {
    pValue: (1 + atLeast) / (1 + rotations),
    observedBest,
    luckMedian: sorted[Math.floor(rotations / 2)],
    luck95: sorted[Math.floor(rotations * 0.95)],
    simulations: rotations,
    strategies: results.length,
  };
}
