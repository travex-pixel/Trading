/**
 * Deterministic synthetic market data for demo mode.
 *
 * THIS IS NOT MARKET DATA. It is a regime-switching random process with
 * volatility clustering, occasional jumps and a correlated second asset,
 * generated from a fixed seed so every user, test and deployment sees exactly
 * the same series. The UI labels it "DEMO DATA — NOT LIVE MARKET DATA".
 *
 * The generator produces hourly bars; 4h and daily bars are aggregated from
 * them so all timeframes are internally consistent.
 */

import { hashSeed, makeGaussian, mulberry32 } from "@/lib/quant/prng";
import type { AssetId, Candle, CandleSeries, DataSource, Timeframe } from "@/lib/quant/types";
import { TIMEFRAME_MS } from "@/lib/quant/types";

export const DEMO_DATASET_VERSION = "demo-v1";

export const DEMO_SOURCE: DataSource = {
  provider: "demo",
  version: DEMO_DATASET_VERSION,
  label: "DEMO DATA — NOT LIVE MARKET DATA",
  isSynthetic: true,
};

/** Demo calendar: three years of hourly bars. */
export const DEMO_START = Date.UTC(2023, 0, 1);
export const DEMO_END = Date.UTC(2025, 11, 31, 23);
const HOUR = 60 * 60 * 1000;
const HOURS = Math.floor((DEMO_END - DEMO_START) / HOUR) + 1;

type Regime = "bull" | "bear" | "chop" | "crash" | "recovery";

interface RegimeParams {
  /** Hourly drift. */
  mu: number;
  /** Baseline hourly volatility. */
  sigma: number;
  /** Mean duration in hours. */
  meanDuration: number;
  /** Per-hour probability of a jump. */
  jumpProb: number;
  /** Jump size standard deviation. */
  jumpSigma: number;
  /** Jump mean (negative means crashes dominate). */
  jumpMu: number;
}

const REGIMES: Record<Regime, RegimeParams> = {
  bull: { mu: 0.00022, sigma: 0.0075, meanDuration: 24 * 75, jumpProb: 0.002, jumpSigma: 0.02, jumpMu: 0.004 },
  bear: { mu: -0.00018, sigma: 0.0095, meanDuration: 24 * 60, jumpProb: 0.004, jumpSigma: 0.025, jumpMu: -0.008 },
  chop: { mu: 0.00001, sigma: 0.0055, meanDuration: 24 * 50, jumpProb: 0.0015, jumpSigma: 0.015, jumpMu: 0 },
  crash: { mu: -0.0025, sigma: 0.022, meanDuration: 24 * 6, jumpProb: 0.03, jumpSigma: 0.04, jumpMu: -0.02 },
  recovery: { mu: 0.0006, sigma: 0.012, meanDuration: 24 * 20, jumpProb: 0.004, jumpSigma: 0.02, jumpMu: 0.006 },
};

const TRANSITIONS: Record<Regime, Array<[Regime, number]>> = {
  bull: [
    ["chop", 0.5],
    ["bear", 0.3],
    ["crash", 0.2],
  ],
  bear: [
    ["chop", 0.45],
    ["recovery", 0.35],
    ["crash", 0.2],
  ],
  chop: [
    ["bull", 0.45],
    ["bear", 0.4],
    ["crash", 0.15],
  ],
  crash: [
    ["recovery", 0.6],
    ["bear", 0.4],
  ],
  recovery: [
    ["bull", 0.55],
    ["chop", 0.45],
  ],
};

function pickNext(current: Regime, u: number): Regime {
  let acc = 0;
  for (const [regime, p] of TRANSITIONS[current]) {
    acc += p;
    if (u < acc) return regime;
  }
  return TRANSITIONS[current][TRANSITIONS[current].length - 1][0];
}

interface AssetSpec {
  startPrice: number;
  /** Sensitivity to the shared market factor. */
  beta: number;
  /** Idiosyncratic hourly volatility. */
  idioSigma: number;
  /** Extra drift. */
  alpha: number;
  volumeBase: number;
}

const ASSET_SPECS: Record<AssetId, AssetSpec> = {
  BTC: { startPrice: 16_500, beta: 1, idioSigma: 0, alpha: 0, volumeBase: 1_200 },
  ETH: { startPrice: 1_200, beta: 1.25, idioSigma: 0.004, alpha: -0.00002, volumeBase: 18_000 },
};

interface MarketFactor {
  /** Log return of the shared factor for each hour. */
  logReturns: Float64Array;
  /** Volatility state per hour, for volume synthesis. */
  vol: Float64Array;
  regimes: Regime[];
}

let factorCache: MarketFactor | null = null;

/** The shared market factor every demo asset loads on. */
function marketFactor(): MarketFactor {
  if (factorCache) return factorCache;
  const uniform = mulberry32(hashSeed(`${DEMO_DATASET_VERSION}:factor`));
  const gauss = makeGaussian(uniform);
  const logReturns = new Float64Array(HOURS);
  const vol = new Float64Array(HOURS);
  const regimes: Regime[] = new Array(HOURS);

  let regime: Regime = "chop";
  let remaining = Math.round(REGIMES[regime].meanDuration * (0.5 + uniform()));
  // GARCH-like persistent volatility factor around the regime baseline.
  let volState = 1;

  for (let h = 0; h < HOURS; h++) {
    if (remaining <= 0) {
      regime = pickNext(regime, uniform());
      remaining = Math.max(24, Math.round(REGIMES[regime].meanDuration * (0.4 + 1.2 * uniform())));
    }
    remaining--;
    const p = REGIMES[regime];
    // Volatility clustering: mean-reverting multiplicative state.
    const shock = gauss();
    volState = Math.max(0.4, Math.min(3.5, volState + 0.04 * (1 - volState) + 0.09 * (Math.abs(shock) - 0.8)));
    const sigma = p.sigma * volState;
    let r = p.mu - 0.5 * sigma * sigma + sigma * shock;
    if (uniform() < p.jumpProb) r += p.jumpMu + p.jumpSigma * gauss();
    logReturns[h] = r;
    vol[h] = sigma;
    regimes[h] = regime;
  }
  factorCache = { logReturns, vol, regimes };
  return factorCache;
}

const hourlyCache = new Map<AssetId, Candle[]>();

/** Hourly candles for one asset. Deterministic and cached in memory. */
export function demoHourlyCandles(asset: AssetId): Candle[] {
  const cached = hourlyCache.get(asset);
  if (cached) return cached;
  const spec = ASSET_SPECS[asset];
  const factor = marketFactor();
  const uniform = mulberry32(hashSeed(`${DEMO_DATASET_VERSION}:${asset}`));
  const gauss = makeGaussian(uniform);
  const candles: Candle[] = new Array(HOURS);
  let price = spec.startPrice;
  const SUBSTEPS = 4;
  for (let h = 0; h < HOURS; h++) {
    const totalLog = spec.alpha + spec.beta * factor.logReturns[h] + spec.idioSigma * gauss();
    const open = price;
    // Distribute the hour's move over sub-steps with noise so high/low are realistic.
    let hi = open;
    let lo = open;
    let p = open;
    const stepSigma = (factor.vol[h] * spec.beta) / Math.sqrt(SUBSTEPS);
    const noises: number[] = [];
    let noiseSum = 0;
    for (let s = 0; s < SUBSTEPS; s++) {
      const z = gauss() * stepSigma;
      noises.push(z);
      noiseSum += z;
    }
    for (let s = 0; s < SUBSTEPS; s++) {
      // Remove the noise mean so the sub-steps sum exactly to totalLog.
      const step = totalLog / SUBSTEPS + (noises[s] - noiseSum / SUBSTEPS);
      p = p * Math.exp(step);
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    const close = open * Math.exp(totalLog);
    if (close > hi) hi = close;
    if (close < lo) lo = close;
    const activity = Math.abs(totalLog) / Math.max(factor.vol[h], 1e-6);
    const volume = spec.volumeBase * (0.6 + 0.8 * uniform() + 0.9 * activity) * (factor.vol[h] / 0.0075);
    candles[h] = {
      time: DEMO_START + h * HOUR,
      open: round(open),
      high: round(hi),
      low: round(lo),
      close: round(close),
      volume: Math.round(volume * 100) / 100,
    };
    price = close;
  }
  hourlyCache.set(asset, candles);
  return candles;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Aggregate hourly candles into a larger timeframe aligned to UTC boundaries. */
export function aggregateCandles(hourly: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1h") return hourly;
  const span = TIMEFRAME_MS[timeframe];
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = -1;
  for (const c of hourly) {
    const b = Math.floor(c.time / span);
    if (b !== bucket) {
      if (current) out.push(current);
      bucket = b;
      current = { time: b * span, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else if (current) {
      if (c.high > current.high) current.high = c.high;
      if (c.low < current.low) current.low = c.low;
      current.close = c.close;
      current.volume = Math.round((current.volume + c.volume) * 100) / 100;
    }
  }
  if (current) out.push(current);
  return out;
}

const seriesCache = new Map<string, CandleSeries>();

export function demoSeries(asset: AssetId, timeframe: Timeframe): CandleSeries {
  const key = `${asset}:${timeframe}`;
  const cached = seriesCache.get(key);
  if (cached) return cached;
  const series: CandleSeries = {
    asset,
    timeframe,
    candles: aggregateCandles(demoHourlyCandles(asset), timeframe),
    source: DEMO_SOURCE,
  };
  seriesCache.set(key, series);
  return series;
}

/** Regime label per hourly bar, exposed so the UI can show the demo's regime history honestly. */
export function demoRegimeAt(time: number): Regime | null {
  const h = Math.floor((time - DEMO_START) / HOUR);
  if (h < 0 || h >= HOURS) return null;
  return marketFactor().regimes[h];
}
