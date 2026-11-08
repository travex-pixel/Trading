/**
 * Market data providers.
 *
 * The app talks to `getAlignedSeries(instrumentIds, timeframe)`. Behind it a
 * provider chain decides, per instrument, where data comes from:
 *
 *   1. EODHD (eodhd.com) when EODHD_API_TOKEN is set: real historical data
 *      for ASX (exchange code AU), US and crypto. Daily bars carry
 *      split- and dividend-adjusted prices; intraday bars are unadjusted.
 *   2. Coinbase Exchange public candles for crypto (no key) when
 *      MARKET_DATA_PROVIDER=coinbase.
 *   3. The deterministic demo dataset, always available, always labelled.
 *
 * Nothing here ever runs in the browser. Keys live in server environment
 * variables only. Every series says what it is in `source`.
 */

import "server-only";

import type { Candle, CandleSeries, DataSource, Timeframe } from "@/lib/quant/types";
import { CALENDARS, localParts, sessionFor, type MarketId } from "./calendar";
import { aggregateCandles, demoSeries, DEMO_SOURCE } from "./demo-data";
import { dedupe, eodhdSource, parseEodhdDaily, parseEodhdIntraday, parseEodhdQuote, type Quote } from "./eodhd";
import { getInstrument, requireInstrument, type Instrument } from "./instruments";

export type { Quote } from "./eodhd";

export type ProviderName = "demo" | "eodhd" | "coinbase";

/* ------------------------------------------------------------------------- */
/* Configuration                                                              */
/* ------------------------------------------------------------------------- */

export function eodhdToken(): string | null {
  const t = process.env.EODHD_API_TOKEN?.trim();
  return t ? t : null;
}

export function coinbaseEnabled(): boolean {
  return (process.env.MARKET_DATA_PROVIDER ?? "").toLowerCase() === "coinbase";
}

export interface ProviderStatus {
  providers: Array<{ name: ProviderName; configured: boolean; markets: MarketId[]; freshness: string; note: string }>;
  /** Which provider will serve each market right now. */
  perMarket: Record<MarketId, { provider: ProviderName; label: string; isSynthetic: boolean }>;
}

export function providerStatus(): ProviderStatus {
  const eod = eodhdToken() !== null;
  const cb = coinbaseEnabled();
  const pick = (market: MarketId): ProviderStatus["perMarket"][MarketId] => {
    if (eod) return { provider: "eodhd", label: "EODHD historical data (end of day adjusted, intraday unadjusted, quotes delayed 15–20 min)", isSynthetic: false };
    if (cb && market === "CRYPTO") return { provider: "coinbase", label: "Coinbase Exchange public candles", isSynthetic: false };
    return { provider: "demo", label: DEMO_SOURCE.label, isSynthetic: true };
  };
  return {
    providers: [
      { name: "eodhd", configured: eod, markets: ["ASX", "US", "CRYPTO"], freshness: "Historical daily (adjusted), intraday (unadjusted), delayed quotes", note: eod ? "Connected. Calls are cached server-side to respect the plan's daily allowance." : "Set EODHD_API_TOKEN on the server to enable real ASX and US history." },
      { name: "coinbase", configured: cb, markets: ["CRYPTO"], freshness: "Historical hourly, no key", note: cb ? "Connected." : "Set MARKET_DATA_PROVIDER=coinbase to enable." },
      { name: "demo", configured: true, markets: ["ASX", "US", "CRYPTO"], freshness: "Simulated", note: "Deterministic synthetic dataset, always available." },
    ],
    perMarket: { ASX: pick("ASX"), US: pick("US"), CRYPTO: pick("CRYPTO") },
  };
}

/* ------------------------------------------------------------------------- */
/* Caching                                                                    */
/* ------------------------------------------------------------------------- */

interface CacheEntry<T> {
  at: number;
  value: T;
}
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* ------------------------------------------------------------------------- */
/* EODHD                                                                      */
/* Docs: https://eodhd.com/financial-apis/api-for-historical-data-and-volumes */
/*       https://eodhd.com/financial-apis/intraday-historical-data-api        */
/*       https://eodhd.com/financial-apis/live-realtime-stocks-api            */
/* Symbols: TICKER.EXCHANGE, e.g. CBA.AU, AAPL.US, BTC-USD.CC.                 */
/* Auth: api_token query parameter. EOD rows carry adjusted_close.            */
/* ------------------------------------------------------------------------- */

const EODHD_HOST = "eodhd.com";
const EODHD_TTL_EOD = 6 * 60 * 60 * 1000; // end-of-day data updates once a day
const EODHD_TTL_INTRADAY = 15 * 60 * 1000;
const EODHD_TTL_QUOTE = 60 * 1000;
/** Earliest history requested for daily bars. */
const EODHD_HISTORY_YEARS = 10;

async function eodhdFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const token = eodhdToken();
  if (!token) throw new Error("EODHD is not configured.");
  const url = new URL(`https://${EODHD_HOST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_token", token);
  url.searchParams.set("fmt", "json");
  if (url.host !== EODHD_HOST) throw new Error("Refusing to fetch from an unexpected host.");
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "edgelab-research/0.2" }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error("EODHD rejected the API token.");
  if (res.status === 402) throw new Error("EODHD: this data is not included in the current plan.");
  if (res.status === 429) throw new Error("EODHD rate limit reached.");
  if (!res.ok) throw new Error(`EODHD responded ${res.status}.`);
  return res.json();
}

async function eodhdSeries(inst: Instrument, timeframe: Timeframe): Promise<CandleSeries> {
  const symbol = inst.providers.eodhd;
  if (!symbol) throw new Error(`${inst.id} has no EODHD symbol.`);
  if (timeframe === "1d") {
    const from = new Date(Date.now() - EODHD_HISTORY_YEARS * 365.25 * 86_400_000).toISOString().slice(0, 10);
    const candles = await cached(`eodhd:eod:${symbol}`, EODHD_TTL_EOD, async () => parseEodhdDaily(await eodhdFetch(`/api/eod/${encodeURIComponent(symbol)}`, { period: "d", from, order: "a" }), inst.market));
    return { asset: inst.id, market: inst.market, currency: inst.currency, timeframe, candles, source: eodhdSource("splits_dividends", "historical") };
  }
  // Intraday: hourly bars, aggregated to 4h per session. EODHD limits 1h ranges to 7200 days; we ask for two years.
  const to = Math.floor(Date.now() / 1000);
  const from = to - 2 * 365 * 86_400;
  const hourly = await cached(`eodhd:1h:${symbol}`, EODHD_TTL_INTRADAY, async () => parseEodhdIntraday(await eodhdFetch(`/api/intraday/${encodeURIComponent(symbol)}`, { interval: "1h", from: String(from), to: String(to) })));
  // Keep only bars inside the market's sessions so equities never carry pre/post-market prints.
  const inSession = inst.market === "CRYPTO" ? hourly : hourly.filter((c) => isWithinSession(inst.market, c.time));
  const candles = timeframe === "1h" ? inSession : aggregateCandles(inSession, "4h", inst.market);
  return { asset: inst.id, market: inst.market, currency: inst.currency, timeframe, candles, source: eodhdSource("none", "historical") };
}

function isWithinSession(market: MarketId, utcMs: number): boolean {
  const p = localParts(CALENDARS[market].timezone, utcMs);
  const s = sessionFor(market, p.year, p.month, p.day);
  return s !== null && utcMs >= s.openUtc && utcMs < s.closeUtc;
}

export async function getQuotes(instrumentIds: string[]): Promise<Quote[]> {
  if (!eodhdToken()) return [];
  const out: Quote[] = [];
  await Promise.all(
    instrumentIds.map(async (id) => {
      const inst = getInstrument(id);
      const symbol = inst?.providers.eodhd;
      if (!inst || !symbol) return;
      try {
        const q = await cached(`eodhd:quote:${symbol}`, EODHD_TTL_QUOTE, async () => parseEodhdQuote(await eodhdFetch(`/api/real-time/${encodeURIComponent(symbol)}`, {}), id));
        if (q) out.push(q);
      } catch {
        // A missing quote is shown as unavailable, never invented.
      }
    }),
  );
  return out;
}

/* ------------------------------------------------------------------------- */
/* Coinbase Exchange public candles (crypto only, no key).                    */
/* ------------------------------------------------------------------------- */

const COINBASE_SOURCE: DataSource = { provider: "coinbase", version: "coinbase-exchange-v1", label: "Coinbase Exchange public market data", isSynthetic: false, freshness: "historical", adjustment: "none", asOf: Date.now() };
const COINBASE_BASE = "https://api.exchange.coinbase.com";
const COINBASE_MAX_CANDLES = 300;
const COINBASE_HISTORY_MS = 2 * 365 * 24 * 60 * 60 * 1000;

async function fetchCoinbaseHourly(product: string): Promise<Candle[]> {
  return cached(`coinbase:${product}`, 10 * 60 * 1000, async () => {
    const hour = 3_600_000;
    const end = Math.floor(Date.now() / hour) * hour;
    const start = end - COINBASE_HISTORY_MS;
    const all: Candle[] = [];
    for (let from = start; from < end; from += COINBASE_MAX_CANDLES * hour) {
      const to = Math.min(end, from + COINBASE_MAX_CANDLES * hour);
      const url = new URL(`${COINBASE_BASE}/products/${encodeURIComponent(product)}/candles`);
      url.searchParams.set("granularity", "3600");
      url.searchParams.set("start", new Date(from).toISOString());
      url.searchParams.set("end", new Date(to).toISOString());
      if (url.host !== "api.exchange.coinbase.com") throw new Error("Refusing to fetch from an unexpected host.");
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "edgelab-research/0.2" }, cache: "no-store" });
      if (!res.ok) throw new Error(`Coinbase responded ${res.status}`);
      const rows = (await res.json()) as unknown;
      if (!Array.isArray(rows)) throw new Error("Unexpected Coinbase payload.");
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 6) continue;
        const [t, low, high, open, close, volume] = row as number[];
        if ([t, low, high, open, close, volume].some((v) => typeof v !== "number" || !Number.isFinite(v))) continue;
        all.push({ time: t * 1000, open, high, low, close, volume });
      }
    }
    all.sort((a, b) => a.time - b.time);
    return dedupe(all);
  });
}

async function coinbaseSeries(inst: Instrument, timeframe: Timeframe): Promise<CandleSeries> {
  const product = inst.providers.coinbase;
  if (!product) throw new Error(`${inst.id} is not available on Coinbase.`);
  const hourly = await fetchCoinbaseHourly(product);
  return { asset: inst.id, market: inst.market, currency: inst.currency, timeframe, candles: aggregateCandles(hourly, timeframe, "CRYPTO"), source: COINBASE_SOURCE };
}

/* ------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* ------------------------------------------------------------------------- */

async function resolveSeries(inst: Instrument, timeframe: Timeframe): Promise<CandleSeries> {
  if (eodhdToken() && inst.providers.eodhd) {
    try {
      const s = await eodhdSeries(inst, timeframe);
      if (s.candles.length > 50) return s;
      throw new Error("EODHD returned too little data.");
    } catch (err) {
      const demo = demoSeries(inst.id, timeframe);
      return { ...demo, source: { ...demo.source, label: `${demo.source.label} (live provider unavailable: ${err instanceof Error ? err.message : "error"})` } };
    }
  }
  if (coinbaseEnabled() && inst.market === "CRYPTO" && inst.providers.coinbase) {
    try {
      return await coinbaseSeries(inst, timeframe);
    } catch (err) {
      const demo = demoSeries(inst.id, timeframe);
      return { ...demo, source: { ...demo.source, label: `${demo.source.label} (live provider unavailable: ${err instanceof Error ? err.message : "error"})` } };
    }
  }
  return demoSeries(inst.id, timeframe);
}

/**
 * Fetch series for several instruments and align them on common timestamps so
 * multi-instrument strategies see the same bars.
 */
export async function getAlignedSeries(instrumentIds: string[], timeframe: Timeframe): Promise<CandleSeries[]> {
  const instruments = instrumentIds.map((id) => requireInstrument(id));
  const series = await Promise.all(instruments.map((inst) => resolveSeries(inst, timeframe)));
  // Strategies trade at most four instruments and need aligned bars; larger
  // requests are watch tables, where each instrument keeps its own history.
  return series.length > 1 && series.length <= 4 ? alignByTime(series) : series;
}

/** Keep only timestamps present in every series. */
export function alignByTime(series: CandleSeries[]): CandleSeries[] {
  const sets = series.map((s) => new Set(s.candles.map((c) => c.time)));
  const common = (t: number) => sets.every((set) => set.has(t));
  return series.map((s) => ({ ...s, candles: s.candles.filter((c) => common(c.time)) }));
}
