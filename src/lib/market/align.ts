/**
 * Pure helpers for combining series from the provider chain. Kept free of
 * server-only imports so the rules are unit tested.
 */

import type { CandleSeries, Timeframe } from "@/lib/quant/types";
import { DEMO_SOURCE } from "./demo-data";

/**
 * A set of instruments traded together must be all real or all synthetic.
 * If live data failed for one of them, aligning it with the others would put
 * real and invented prices into the same backtest, so the whole set falls
 * back to the demo dataset and says why.
 */
export function neverMixSynthetic(
  series: CandleSeries[],
  timeframe: Timeframe,
  demo: (id: string, tf: Timeframe) => CandleSeries,
): CandleSeries[] {
  const synthetic = series.filter((s) => s.source.isSynthetic);
  if (synthetic.length === 0 || synthetic.length === series.length)
    return series;
  const missing = synthetic
    .map((s) => s.asset.split(":")[1] ?? s.asset)
    .join(", ");
  return series.map((s) => {
    const d = s.source.isSynthetic ? s : demo(s.asset, timeframe);
    return {
      ...d,
      source: {
        ...d.source,
        label: `${DEMO_SOURCE.label} (live data unavailable for ${missing}, so the whole set uses demo data rather than mixing real and synthetic prices)`,
      },
    };
  });
}

/** Keep only timestamps present in every series. */
export function alignByTime(series: CandleSeries[]): CandleSeries[] {
  const sets = series.map((s) => new Set(s.candles.map((c) => c.time)));
  const common = (t: number) => sets.every((set) => set.has(t));
  return series.map((s) => ({
    ...s,
    candles: s.candles.filter((c) => common(c.time)),
  }));
}
