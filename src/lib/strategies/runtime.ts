/**
 * The contract between a strategy definition and the backtesting engine.
 *
 * A strategy prepares its indicators once over the full history (every
 * indicator is causal, so this introduces no look-ahead) and then answers one
 * question per bar: given everything up to and including this bar's close,
 * what position should I hold for each asset?
 */

import type { Series } from "@/lib/quant/indicators";
import type { AssetId, Candle, OpenPosition } from "@/lib/quant/types";
import type { StrategyConfig } from "./schema";

export type Target = 0 | 1;

export interface StrategySignal {
  /** Desired direction per asset. Missing assets keep their current state. */
  targets: Partial<Record<AssetId, Target>>;
  /** Plain-English explanation of this bar's decision, or null when nothing changed. */
  note: string | null;
  /**
   * Optional stop price updates (e.g. trailing stops). The engine only ever
   * raises a stop, never lowers it.
   */
  stopUpdates?: Partial<Record<AssetId, number>>;
}

export interface StrategyContext {
  config: StrategyConfig;
  series: Record<AssetId, Candle[]>;
  /** Current bar index. The strategy may read candles[0..index] only. */
  index: number;
  indicators: Record<string, Series>;
  positions: Partial<Record<AssetId, OpenPosition>>;
}

export type IndicatorPane = "price" | "oscillator";

export interface IndicatorDisplay {
  key: string;
  label: string;
  pane: IndicatorPane;
  /** Horizontal guide levels for oscillator panes (e.g. RSI 30/70). */
  levels?: number[];
}

export interface PreparedStrategy {
  indicators: Record<string, Series>;
  display: IndicatorDisplay[];
  /** Number of bars needed before the first valid signal. */
  warmupBars: number;
  signal: (ctx: StrategyContext) => StrategySignal;
}

export type StrategyFactory = (config: StrategyConfig, series: Record<AssetId, Candle[]>) => PreparedStrategy;

export function indicatorKey(asset: AssetId, name: string): string {
  return `${asset}:${name}`;
}

/** Read a candle series the strategy is allowed to see at `index` (no future bars). */
export function visible(candles: Candle[], index: number): Candle[] {
  return candles.slice(0, index + 1);
}
