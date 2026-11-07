"use client";

/**
 * Client-side access to market data with an in-memory cache and a React hook.
 */

import { useEffect, useState } from "react";
import type { AssetId, Candle, CandleSeries, Timeframe } from "@/lib/quant/types";

interface ColumnarSeries {
  asset: AssetId;
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
  for (let i = 0; i < n; i++) candles[i] = { time: s.t[i], open: s.o[i], high: s.h[i], low: s.l[i], close: s.c[i], volume: s.v[i] };
  return { asset: s.asset, timeframe: s.timeframe, candles, source: s.source };
}

const cache = new Map<string, Promise<CandleSeries[]>>();

export function fetchCandles(assets: AssetId[], timeframe: Timeframe): Promise<CandleSeries[]> {
  const sorted = [...assets].sort();
  const key = `${sorted.join(",")}:${timeframe}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const p = (async () => {
    const res = await fetch(`/api/market/candles?assets=${sorted.join(",")}&timeframe=${timeframe}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Market data request failed (${res.status}).`);
    }
    const json = (await res.json()) as { series: ColumnarSeries[] };
    return json.series.map(fromColumnar);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export interface CandlesState {
  series: CandleSeries[] | null;
  error: string | null;
  loading: boolean;
}

export function useCandles(assets: AssetId[], timeframe: Timeframe): CandlesState {
  const key = `${[...assets].sort().join(",")}:${timeframe}`;
  const [state, setState] = useState<CandlesState>({ series: null, error: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchCandles(key.split(":")[0].split(",") as AssetId[], key.split(":")[1] as Timeframe)
      .then((series) => {
        if (!cancelled) setState({ series, error: null, loading: false });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ series: null, error: err.message, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}
