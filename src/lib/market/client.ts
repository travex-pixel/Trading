"use client";

/**
 * Client-side access to market data with an in-memory cache and a React hook.
 */

import { useEffect, useState } from "react";
import type {
  AssetId,
  Candle,
  CandleSeries,
  Timeframe,
} from "@/lib/quant/types";

interface ColumnarSeries {
  asset: AssetId;
  market: CandleSeries["market"];
  currency: CandleSeries["currency"];
  timeframe: Timeframe;
  source: CandleSeries["source"];
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

function fromColumnar(s: ColumnarSeries): CandleSeries {
  const n = s.t.length;
  const candles: Candle[] = new Array(n);
  for (let i = 0; i < n; i++)
    candles[i] = {
      time: s.t[i],
      open: s.o[i],
      high: s.h[i],
      low: s.l[i],
      close: s.c[i],
      volume: s.v[i],
    };
  return {
    asset: s.asset,
    market: s.market,
    currency: s.currency,
    timeframe: s.timeframe,
    candles,
    source: s.source,
  };
}

const cache = new Map<string, Promise<CandleSeries[]>>();

export function fetchCandles(
  assets: AssetId[],
  timeframe: Timeframe,
): Promise<CandleSeries[]> {
  const sorted = [...assets].sort();
  const key = `${sorted.join(",")}|${timeframe}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const p = (async () => {
    const res = await fetch(
      `/api/market/candles?assets=${encodeURIComponent(sorted.join(","))}&timeframe=${timeframe}`,
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        body.error ?? `Market data request failed (${res.status}).`,
      );
    }
    const json = (await res.json()) as { series: ColumnarSeries[] };
    return json.series.map(fromColumnar);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export interface CandlesState {
  /** Series for exactly the requested instruments and timeframe, or null while they load. */
  series: CandleSeries[] | null;
  error: string | null;
  loading: boolean;
  /**
   * The last series that did load, possibly for other instruments. Only for
   * keeping a dimmed view on screen during a switch. Never compute with it.
   */
  previous: CandleSeries[] | null;
}

interface Loaded {
  key: string;
  series: CandleSeries[] | null;
  error: string | null;
}

export function useCandles(
  assets: AssetId[],
  timeframe: Timeframe,
): CandlesState {
  const key = `${[...assets].sort().join(",")}|${timeframe}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let cancelled = false;
    const [ids, tf] = key.split("|");
    fetchCandles(ids.split(",") as AssetId[], tf as Timeframe)
      .then((series) => {
        if (!cancelled) setLoaded({ key, series, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoaded({ key, series: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  // Only hand back data for the key that was asked for. Returning the previous
  // instruments' series while a new request is in flight let consumers pair
  // one instrument's prices with another's configuration: the Markets table
  // crashed and the Lab flashed an error whenever live data was slow.
  const current = loaded && loaded.key === key ? loaded : null;
  return {
    series: current?.series ?? null,
    error: current?.error ?? null,
    loading: current === null,
    previous: loaded?.series ?? null,
  };
}
