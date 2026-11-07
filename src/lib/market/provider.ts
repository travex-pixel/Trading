/**
 * Market data providers.
 *
 * The app talks to a single `getSeries` function. Which provider backs it is
 * decided server-side from MARKET_DATA_PROVIDER. The browser never talks to
 * an exchange directly and never sees provider credentials (none are needed
 * for the providers shipped here, but the boundary is the same).
 */

import "server-only";

import type { AssetId, Candle, CandleSeries, DataSource, Timeframe } from "@/lib/quant/types";
import { aggregateCandles, demoSeries } from "./demo-data";

export type ProviderName = "demo" | "coinbase";

export interface MarketDataProvider {
  name: ProviderName;
  source: DataSource;
  getSeries(asset: AssetId, timeframe: Timeframe): Promise<CandleSeries>;
}

export function configuredProviderName(): ProviderName {
  const raw = (process.env.MARKET_DATA_PROVIDER ?? "demo").toLowerCase();
  return raw === "coinbase" ? "coinbase" : "demo";
}

const demoProvider: MarketDataProvider = {
  name: "demo",
  source: demoSeries("BTC", "1d").source,
  async getSeries(asset, timeframe) {
    return demoSeries(asset, timeframe);
  },
};

/* ------------------------------------------------------------------------- */
/* Coinbase Exchange public candles (no API key).                             */
/* Docs: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles */
/* Rate limit: 10 requests/second public. Max 300 candles per request.        */
/* ------------------------------------------------------------------------- */

const COINBASE_SOURCE: DataSource = {
  provider: "coinbase",
  version: "coinbase-exchange-v1",
  label: "Coinbase Exchange public market data",
  isSynthetic: false,
};

const COINBASE_PRODUCTS: Record<AssetId, string> = { BTC: "BTC-USD", ETH: "ETH-USD" };
const COINBASE_BASE = "https://api.exchange.coinbase.com";
const COINBASE_MAX_CANDLES = 300;
/** How much hourly history to load: two years. */
const COINBASE_HISTORY_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const coinbaseCache = new Map<string, { fetchedAt: number; candles: Candle[] }>();
const COINBASE_TTL_MS = 10 * 60 * 1000;

function coinbaseAllowedHost(url: string): boolean {
  return new URL(url).host === "api.exchange.coinbase.com";
}

async function fetchCoinbaseHourly(asset: AssetId): Promise<Candle[]> {
  const cached = coinbaseCache.get(asset);
  if (cached && Date.now() - cached.fetchedAt < COINBASE_TTL_MS) return cached.candles;

  const product = COINBASE_PRODUCTS[asset];
  const hour = 3_600_000;
  const end = Math.floor(Date.now() / hour) * hour;
  const start = end - COINBASE_HISTORY_MS;
  const all: Candle[] = [];
  for (let from = start; from < end; from += COINBASE_MAX_CANDLES * hour) {
    const to = Math.min(end, from + COINBASE_MAX_CANDLES * hour);
    const url = `${COINBASE_BASE}/products/${encodeURIComponent(product)}/candles?granularity=3600&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}`;
    if (!coinbaseAllowedHost(url)) throw new Error("Refusing to fetch from an unexpected host.");
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "edgelab-research/0.1" }, cache: "no-store" });
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
  // Coinbase returns newest first and may overlap between pages: sort and dedupe.
  all.sort((a, b) => a.time - b.time);
  const deduped: Candle[] = [];
  for (const c of all) {
    if (deduped.length && deduped[deduped.length - 1].time === c.time) continue;
    if (c.low <= 0 || c.high < c.low) continue;
    deduped.push(c);
  }
  coinbaseCache.set(asset, { fetchedAt: Date.now(), candles: deduped });
  return deduped;
}

const coinbaseProvider: MarketDataProvider = {
  name: "coinbase",
  source: COINBASE_SOURCE,
  async getSeries(asset, timeframe) {
    const hourly = await fetchCoinbaseHourly(asset);
    return { asset, timeframe, candles: aggregateCandles(hourly, timeframe), source: COINBASE_SOURCE };
  },
};

export function marketDataProvider(): MarketDataProvider {
  return configuredProviderName() === "coinbase" ? coinbaseProvider : demoProvider;
}

/**
 * Fetch aligned series for several assets. If a live provider fails, fall
 * back to demo data and say so in the source label rather than failing the
 * whole experience.
 */
export async function getAlignedSeries(assets: AssetId[], timeframe: Timeframe): Promise<CandleSeries[]> {
  const provider = marketDataProvider();
  try {
    const series = await Promise.all(assets.map((a) => provider.getSeries(a, timeframe)));
    if (series.length > 1) return alignByTime(series);
    return series;
  } catch (err) {
    if (provider.name === "demo") throw err;
    const fallback = await Promise.all(assets.map((a) => demoProvider.getSeries(a, timeframe)));
    return fallback.map((s) => ({ ...s, source: { ...s.source, label: `${s.source.label} (live provider unavailable)` } }));
  }
}

/** Keep only timestamps present in every series so multi-asset strategies see aligned bars. */
export function alignByTime(series: CandleSeries[]): CandleSeries[] {
  const sets = series.map((s) => new Set(s.candles.map((c) => c.time)));
  const common = (t: number) => sets.every((set) => set.has(t));
  return series.map((s) => ({ ...s, candles: s.candles.filter((c) => common(c.time)) }));
}
