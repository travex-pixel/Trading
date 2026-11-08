/**
 * Deterministic synthetic market data for demo mode, for every instrument in
 * the registry.
 *
 * THIS IS NOT MARKET DATA. Each market has its own regime-switching factor
 * process with volatility clustering and jumps; each instrument loads on its
 * market factor with its own beta and idiosyncratic noise, from a fixed seed,
 * so every user, test and deployment sees exactly the same series. Equities
 * trade only inside their exchange sessions on trading days, with an overnight
 * gap between sessions; crypto trades around the clock. Dividends and
 * corporate actions are NOT modelled in the demo dataset. The UI labels the
 * data "DEMO DATA — NOT LIVE MARKET DATA" wherever it appears.
 *
 * Hourly bars are generated; 4h and daily bars are aggregated per session so
 * all timeframes of one instrument are internally consistent.
 */

import { hashSeed, makeGaussian, mulberry32 } from "@/lib/quant/prng";
import type { Candle, CandleSeries, DataSource, Timeframe } from "@/lib/quant/types";
import { CALENDARS, sessionBarTimes, tradingSessions, type MarketId } from "./calendar";
import { requireInstrument, type Instrument } from "./instruments";

export const DEMO_DATASET_VERSION = "demo-v2";

export const DEMO_SOURCE: DataSource = {
  provider: "demo",
  version: DEMO_DATASET_VERSION,
  label: "DEMO DATA — NOT LIVE MARKET DATA",
  isSynthetic: true,
  freshness: "simulated",
  adjustment: "none",
  asOf: null,
};

/** Demo calendar: five years for equities, three for crypto. */
export const DEMO_START: Record<MarketId, number> = {
  ASX: Date.UTC(2021, 0, 1),
  US: Date.UTC(2021, 0, 1),
  CRYPTO: Date.UTC(2023, 0, 1),
};
export const DEMO_END = Date.UTC(2025, 11, 31, 23);
const HOUR = 60 * 60 * 1000;

type Regime = "bull" | "bear" | "chop" | "crash" | "recovery";

interface RegimeParams {
  /** Drift per hour of trading. */
  mu: number;
  /** Baseline volatility per hour of trading. */
  sigma: number;
  /** Mean duration in trading hours. */
  meanDuration: number;
  jumpProb: number;
  jumpSigma: number;
  jumpMu: number;
}

/**
 * Regime parameters per market family. Drift is per trading hour; equity
 * markets trade about six hours a day, so their per-hour drift is larger than
 * crypto's but applies to far fewer bars. Calibrated so a broad equity index
 * shows roughly 6–10% annual growth, 15–18% volatility and 20–35% worst
 * drawdowns over the demo calendar, while crypto keeps its 60%+ volatility.
 */
type RegimeSet = { params: Record<Regime, RegimeParams>; transitions: Record<Regime, Array<[Regime, number]>> };

function cryptoRegimes(): RegimeSet {
  return {
    params: {
      bull: { mu: 0.00022, sigma: 0.0075, meanDuration: 24 * 75, jumpProb: 0.002, jumpSigma: 0.02, jumpMu: 0.004 },
      bear: { mu: -0.00018, sigma: 0.0095, meanDuration: 24 * 60, jumpProb: 0.004, jumpSigma: 0.025, jumpMu: -0.008 },
      chop: { mu: 0.00001, sigma: 0.0055, meanDuration: 24 * 50, jumpProb: 0.0015, jumpSigma: 0.015, jumpMu: 0 },
      crash: { mu: -0.0025, sigma: 0.022, meanDuration: 24 * 6, jumpProb: 0.03, jumpSigma: 0.04, jumpMu: -0.02 },
      recovery: { mu: 0.0006, sigma: 0.012, meanDuration: 24 * 20, jumpProb: 0.004, jumpSigma: 0.02, jumpMu: 0.006 },
    },
    transitions: {
      bull: [["chop", 0.5], ["bear", 0.3], ["crash", 0.2]],
      bear: [["chop", 0.45], ["recovery", 0.35], ["crash", 0.2]],
      chop: [["bull", 0.45], ["bear", 0.4], ["crash", 0.15]],
      crash: [["recovery", 0.6], ["bear", 0.4]],
      recovery: [["bull", 0.55], ["chop", 0.45]],
    },
  };
}

function equityRegimes(): RegimeSet {
  // Durations are in trading hours (about 6 a day, 1512 a year on the ASX).
  return {
    params: {
      bull: { mu: 0.00014, sigma: 0.0028, meanDuration: 6 * 200, jumpProb: 0.0008, jumpSigma: 0.008, jumpMu: 0.001 },
      bear: { mu: -0.00014, sigma: 0.0042, meanDuration: 6 * 90, jumpProb: 0.0015, jumpSigma: 0.01, jumpMu: -0.002 },
      chop: { mu: 0.00003, sigma: 0.0026, meanDuration: 6 * 120, jumpProb: 0.0006, jumpSigma: 0.006, jumpMu: 0 },
      crash: { mu: -0.0012, sigma: 0.0095, meanDuration: 6 * 15, jumpProb: 0.01, jumpSigma: 0.018, jumpMu: -0.006 },
      recovery: { mu: 0.00026, sigma: 0.0048, meanDuration: 6 * 60, jumpProb: 0.0015, jumpSigma: 0.009, jumpMu: 0.002 },
    },
    transitions: {
      bull: [["chop", 0.6], ["bear", 0.28], ["crash", 0.12]],
      bear: [["recovery", 0.5], ["chop", 0.4], ["crash", 0.1]],
      chop: [["bull", 0.6], ["bear", 0.32], ["crash", 0.08]],
      crash: [["recovery", 0.7], ["bear", 0.3]],
      recovery: [["bull", 0.6], ["chop", 0.4]],
    },
  };
}

function regimeSet(market: MarketId): RegimeSet {
  return market === "CRYPTO" ? cryptoRegimes() : equityRegimes();
}

function pickNext(set: RegimeSet, current: Regime, u: number): Regime {
  const options = set.transitions[current];
  let acc = 0;
  for (const [regime, p] of options) {
    acc += p;
    if (u < acc) return regime;
  }
  return options[options.length - 1][0];
}

/**
 * Market settings for the generator. Equity markets have far lower hourly
 * volatility than crypto and spend fewer hours trading, so the factor is
 * scaled to produce realistic annualised volatility (roughly 15–20% for a
 * broad equity index, 60%+ for Bitcoin).
 */
const MARKET_GEN: Record<MarketId, { gapSigma: number; factorSigma: number }> = {
  // Equity index factor: about 0.3% per trading hour plus an overnight gap, near 16% annualised.
  ASX: { gapSigma: 0.0045, factorSigma: 0.0028 },
  US: { gapSigma: 0.005, factorSigma: 0.0029 },
  CRYPTO: { gapSigma: 0, factorSigma: 0.0075 },
};

interface MarketFactor {
  /** Bar open times (hourly, within sessions) for the whole demo calendar. */
  times: number[];
  /** Log return of the shared factor for each bar. */
  logReturns: Float64Array;
  /** Volatility state per bar, for volume synthesis. */
  vol: Float64Array;
  /** Index of the first bar of each session (for overnight gaps). */
  sessionStarts: Set<number>;
  regimes: Regime[];
}

const factorCache = new Map<MarketId, MarketFactor>();

/** The shared factor every instrument in a market loads on. */
function marketFactor(market: MarketId): MarketFactor {
  const cached = factorCache.get(market);
  if (cached) return cached;
  const gen = MARKET_GEN[market];
  const set = regimeSet(market);
  const R = set.params;
  const sessions = tradingSessions(market, DEMO_START[market], DEMO_END);
  const times: number[] = [];
  const sessionStarts = new Set<number>();
  for (const s of sessions) {
    const bars = sessionBarTimes(s, "1h");
    sessionStarts.add(times.length);
    for (const t of bars) times.push(t);
  }
  const n = times.length;
  const uniform = mulberry32(hashSeed(`${DEMO_DATASET_VERSION}:factor:${market}`));
  const gauss = makeGaussian(uniform);
  const logReturns = new Float64Array(n);
  const vol = new Float64Array(n);
  const regimeAt: Regime[] = new Array(n);

  let regime: Regime = "chop";
  let remaining = Math.round(R[regime].meanDuration * (0.5 + uniform()));
  let volState = 1;

  for (let i = 0; i < n; i++) {
    if (remaining <= 0) {
      regime = pickNext(set, regime, uniform());
      remaining = Math.max(24, Math.round(R[regime].meanDuration * (0.4 + 1.2 * uniform())));
    }
    remaining--;
    const p = R[regime];
    const shock = gauss();
    volState = Math.max(0.4, Math.min(3.5, volState + 0.04 * (1 - volState) + 0.09 * (Math.abs(shock) - 0.8)));
    const sigma = p.sigma * volState;
    let r = p.mu - 0.5 * sigma * sigma + sigma * shock;
    if (uniform() < p.jumpProb) r += p.jumpMu + p.jumpSigma * gauss();
    // Overnight gap: the first bar of a session carries the news since the last close.
    if (sessionStarts.has(i) && i > 0 && gen.gapSigma > 0) r += gen.gapSigma * volState * gauss();
    logReturns[i] = r;
    vol[i] = sigma;
    regimeAt[i] = regime;
  }
  const factor: MarketFactor = { times, logReturns, vol, sessionStarts, regimes: regimeAt };
  factorCache.set(market, factor);
  return factor;
}

const hourlyCache = new Map<string, Candle[]>();

/** Hourly candles (within sessions) for one instrument. Deterministic and cached in memory. */
export function demoHourlyCandles(instrumentId: string): Candle[] {
  const cached = hourlyCache.get(instrumentId);
  if (cached) return cached;
  const inst = requireInstrument(instrumentId);
  const factor = marketFactor(inst.market);
  const gen = MARKET_GEN[inst.market];
  const uniform = mulberry32(hashSeed(`${DEMO_DATASET_VERSION}:${instrumentId}`));
  const gauss = makeGaussian(uniform);
  const n = factor.times.length;
  const candles: Candle[] = new Array(n);

  // Beta and idiosyncratic volatility from the instrument's target annualised vol.
  const barsPerYear = inst.market === "CRYPTO" ? 24 * 365 : (CALENDARS[inst.market].tradingDaysPerYear * 6 + 0) * 1.0;
  const targetHourly = inst.demoVol / Math.sqrt(barsPerYear);
  const factorHourly = gen.factorSigma;
  const beta = inst.kind === "etf" ? 1 : Math.min(1.6, Math.max(0.6, (targetHourly / factorHourly) * 0.75));
  const idio = inst.kind === "etf" ? targetHourly * 0.15 : Math.sqrt(Math.max(0, targetHourly ** 2 - (beta * factorHourly) ** 2)) * 0.9;
  const alpha = (uniform() - 0.5) * 0.00004;

  let price = inst.demoStart;
  const SUBSTEPS = 4;
  const volumeBase = inst.market === "CRYPTO" ? (inst.symbol === "BTC" ? 1_200 : inst.symbol === "ETH" ? 18_000 : 400_000) : Math.max(50_000, Math.round(40_000_000 / inst.demoStart));
  const decimals = price < 10 ? 3 : 2;
  const round = (v: number) => Number(v.toFixed(decimals));

  for (let i = 0; i < n; i++) {
    const totalLog = alpha + beta * factor.logReturns[i] + idio * gauss();
    const open = price;
    let hi = open;
    let lo = open;
    let p = open;
    const stepSigma = (factor.vol[i] * beta) / Math.sqrt(SUBSTEPS);
    const noises: number[] = [];
    let noiseSum = 0;
    for (let s = 0; s < SUBSTEPS; s++) {
      const z = gauss() * stepSigma;
      noises.push(z);
      noiseSum += z;
    }
    for (let s = 0; s < SUBSTEPS; s++) {
      const step = totalLog / SUBSTEPS + (noises[s] - noiseSum / SUBSTEPS);
      p = p * Math.exp(step);
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    const close = open * Math.exp(totalLog);
    if (close > hi) hi = close;
    if (close < lo) lo = close;
    const activity = Math.abs(totalLog) / Math.max(factor.vol[i], 1e-6);
    const sessionBoost = factor.sessionStarts.has(i) ? 1.6 : 1;
    const volume = volumeBase * (0.6 + 0.8 * uniform() + 0.9 * activity) * (factor.vol[i] / factorHourly) * sessionBoost;
    candles[i] = { time: factor.times[i], open: round(open), high: round(hi), low: round(lo), close: round(close), volume: Math.round(volume) };
    price = close;
  }
  // Open of the next bar equals the previous close within a session; across sessions the first
  // bar's return already includes the gap, so the gap shows up as open != previous close:
  for (let i = 1; i < n; i++) {
    if (factor.sessionStarts.has(i)) {
      const gap = Math.exp(gen.gapSigma * 0.8 * (hashSeed(`${instrumentId}:gap:${i}`) / 4294967296 - 0.5) * 2);
      const c = candles[i];
      const o = round(candles[i - 1].close * gap);
      candles[i] = { ...c, open: o, high: Math.max(c.high, o), low: Math.min(c.low, o) };
    }
  }
  hourlyCache.set(instrumentId, candles);
  return candles;
}

/**
 * Aggregate hourly session bars into 4h or daily bars, aligned to sessions:
 * a daily bar covers one session; a 4h bar starts at the session open and
 * every four hours after it.
 */
export function aggregateCandles(hourly: Candle[], timeframe: Timeframe, market: MarketId): Candle[] {
  if (timeframe === "1h" || hourly.length === 0) return hourly;
  const sessions = tradingSessions(market, hourly[0].time, hourly[hourly.length - 1].time);
  const bucketOf = new Map<number, number>();
  for (const s of sessions) {
    const buckets = sessionBarTimes(s, timeframe);
    for (const t of sessionBarTimes(s, "1h")) {
      let b = buckets[0];
      for (const bt of buckets) if (bt <= t) b = bt;
      bucketOf.set(t, b);
    }
  }
  const out: Candle[] = [];
  let current: Candle | null = null;
  let bucket = -1;
  for (const c of hourly) {
    const b = bucketOf.get(c.time) ?? c.time;
    if (b !== bucket) {
      if (current) out.push(current);
      bucket = b;
      current = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else if (current) {
      if (c.high > current.high) current.high = c.high;
      if (c.low < current.low) current.low = c.low;
      current.close = c.close;
      current.volume += c.volume;
    }
  }
  if (current) out.push(current);
  return out;
}

const seriesCache = new Map<string, CandleSeries>();

export function demoSeries(instrumentId: string, timeframe: Timeframe): CandleSeries {
  const key = `${instrumentId}:${timeframe}`;
  const cached = seriesCache.get(key);
  if (cached) return cached;
  const inst: Instrument = requireInstrument(instrumentId);
  const series: CandleSeries = {
    asset: inst.id,
    market: inst.market,
    currency: inst.currency,
    timeframe,
    candles: aggregateCandles(demoHourlyCandles(inst.id), timeframe, inst.market),
    source: DEMO_SOURCE,
  };
  seriesCache.set(key, series);
  return series;
}

/** Regime label per hourly bar, exposed so the UI can show the demo's regime history honestly. */
export function demoRegimeAt(market: MarketId, time: number): Regime | null {
  const f = marketFactor(market);
  let lo = 0;
  let hi = f.times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f.times[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  return f.times[lo] <= time && time - f.times[lo] < HOUR * 24 ? f.regimes[lo] : null;
}
