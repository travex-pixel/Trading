/**
 * Technical indicators.
 *
 * Every function returns an array aligned to the input: output[i] depends only
 * on input[0..i] (causal), and is `null` during the warm-up period. This is
 * what makes it safe to precompute indicators once and read them bar by bar
 * in the backtester without look-ahead.
 */

import type { Candle } from "./types";

export type Series = (number | null)[];

function emptySeries(n: number): Series {
  return new Array<number | null>(n).fill(null);
}

export function closes(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length);
  for (let i = 0; i < candles.length; i++) out[i] = candles[i].close;
  return out;
}

/** Simple moving average. */
export function sma(values: readonly number[], period: number): Series {
  const n = values.length;
  const out = emptySeries(n);
  if (period <= 0 || n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average seeded with the SMA of the first `period` values. */
export function ema(values: readonly number[], period: number): Series {
  const n = values.length;
  const out = emptySeries(n);
  if (period <= 0 || n === 0) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      seedSum += values[i];
      continue;
    }
    if (prev === null) {
      seedSum += values[i];
      prev = seedSum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI (smoothed average gains and losses). */
export function rsi(values: readonly number[], period: number): Series {
  const n = values.length;
  const out = emptySeries(n);
  if (period <= 0 || n < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(values: readonly number[], fast: number, slow: number, signalPeriod: number): MacdResult {
  const n = values.length;
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = emptySeries(n);
  const compact: number[] = [];
  const compactIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f !== null && s !== null) {
      macdLine[i] = f - s;
      compact.push(f - s);
      compactIdx.push(i);
    }
  }
  const sigCompact = ema(compact, signalPeriod);
  const signal = emptySeries(n);
  const histogram = emptySeries(n);
  for (let j = 0; j < compact.length; j++) {
    const s = sigCompact[j];
    if (s !== null) {
      const i = compactIdx[j];
      signal[i] = s;
      histogram[i] = compact[j] - s;
    }
  }
  return { macd: macdLine, signal, histogram };
}

/** True range per bar. The first bar uses high - low. */
export function trueRange(candles: Candle[]): number[] {
  const n = candles.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (i === 0) {
      out[i] = c.high - c.low;
      continue;
    }
    const prevClose = candles[i - 1].close;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  return out;
}

/** Average true range using Wilder smoothing. */
export function atr(candles: Candle[], period: number): Series {
  const n = candles.length;
  const out = emptySeries(n);
  if (period <= 0 || n < period) return out;
  const tr = trueRange(candles);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Highest high and lowest low over the previous `period` bars, EXCLUDING the
 * current bar, so a breakout can be compared against prior history.
 */
export function donchian(candles: Candle[], period: number): { upper: Series; lower: Series } {
  const n = candles.length;
  const upper = emptySeries(n);
  const lower = emptySeries(n);
  if (period <= 0) return { upper, lower };
  for (let i = period; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period; j < i; j++) {
      const c = candles[j];
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

/** Rolling standard deviation (population) of values. */
export function rollingStd(values: readonly number[], period: number): Series {
  const n = values.length;
  const out = emptySeries(n);
  if (period <= 1 || n < period) return out;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    sumSq += values[i] * values[i];
    if (i >= period) {
      sum -= values[i - period];
      sumSq -= values[i - period] * values[i - period];
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      out[i] = Math.sqrt(variance);
    }
  }
  return out;
}

/** Simple per-bar returns. returns[0] is 0. */
export function simpleReturns(values: readonly number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    out[i] = prev === 0 ? 0 : values[i] / prev - 1;
  }
  return out;
}

/** Return over the previous `period` bars: value[i] / value[i - period] - 1. */
export function trailingReturn(values: readonly number[], period: number): Series {
  const n = values.length;
  const out = emptySeries(n);
  for (let i = period; i < n; i++) {
    const base = values[i - period];
    out[i] = base === 0 ? null : values[i] / base - 1;
  }
  return out;
}
