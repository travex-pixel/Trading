/**
 * Replay derivation: given a completed backtest and a cursor into its candle
 * window, compute exactly what was knowable at that bar. Everything here is
 * filtered by timestamp <= cursor time, so nothing from the future leaks.
 */

import type { BacktestResult, Candle, Trade } from "@/lib/quant/types";
import type { IndicatorDisplay } from "@/lib/strategies/runtime";

export interface ReplayEvent {
  n: number;
  kind: "entry" | "exit";
  time: number;
  trade: Trade;
  text: string;
}

export interface ReplayFrame {
  cursor: number;
  time: number;
  candle: Candle;
  equity: number;
  cash: number;
  drawdown: number;
  exposure: number;
  /** Trade open during this bar (entered at or before, not yet exited before this bar). */
  open: Trade | null;
  openPnl: number;
  openPnlPct: number;
  realisedPnl: number;
  /** Events (entries/exits) at or before the cursor, newest last. */
  events: ReplayEvent[];
  /** Most recent signal note at or before the cursor. */
  lastNote: { time: number; note: string } | null;
  /** True when the cursor is on a bar where an entry filled. */
  fillBarEntry: Trade | null;
  fillBarExit: Trade | null;
  indicatorValues: Array<{ label: string; value: number | null; pane: IndicatorDisplay["pane"] }>;
}

/** All entry/exit events of the result in time order, numbered. */
export function buildEvents(result: BacktestResult): ReplayEvent[] {
  const raw: Omit<ReplayEvent, "n">[] = [];
  for (const t of result.trades) {
    raw.push({ kind: "entry", time: t.entryTime, trade: t, text: t.entryReason });
    if (t.exitReason !== "end_of_data") raw.push({ kind: "exit", time: t.exitTime, trade: t, text: t.exitReasonText });
  }
  raw.sort((a, b) => a.time - b.time || (a.kind === "exit" ? -1 : 1));
  return raw.map((e, i) => ({ ...e, n: i + 1 }));
}

export function frameAt(result: BacktestResult, candles: Candle[], events: ReplayEvent[], display: IndicatorDisplay[], cursor: number): ReplayFrame | null {
  if (candles.length === 0) return null;
  const i = Math.max(0, Math.min(candles.length - 1, cursor));
  const candle = candles[i];
  const time = candle.time;
  const eq = result.equity[i];

  let open: Trade | null = null;
  let fillBarEntry: Trade | null = null;
  let fillBarExit: Trade | null = null;
  let realised = 0;
  for (const t of result.trades) {
    if (t.entryTime === time) fillBarEntry = t;
    if (t.exitTime === time && t.exitReason !== "end_of_data") fillBarExit = t;
    const closedBefore = t.exitReason !== "end_of_data" && t.exitTime <= time;
    if (closedBefore) realised += t.pnl;
    else if (t.entryTime <= time) open = t;
  }
  const openPnl = open ? open.quantity * (candle.close - open.entryPrice) - open.fees / 2 : 0;
  const openPnlPct = open ? (candle.close / open.entryPrice - 1) * 100 : 0;

  const visibleEvents = events.filter((e) => e.time <= time);
  let lastNote: ReplayFrame["lastNote"] = null;
  for (let k = result.signals.length - 1; k >= 0; k--) {
    const s = result.signals[k];
    if (s.time <= time) {
      if (s.note) lastNote = { time: s.time, note: s.note };
      break;
    }
  }
  if (!lastNote) {
    for (let k = result.signals.length - 1; k >= 0; k--) {
      const s = result.signals[k];
      if (s.time <= time && s.note) {
        lastNote = { time: s.time, note: s.note };
        break;
      }
    }
  }

  const indicatorValues = display.map((d) => ({ label: d.label, pane: d.pane, value: result.indicators[d.key]?.[i] ?? null }));

  return {
    cursor: i,
    time,
    candle,
    equity: eq?.equity ?? result.assumptions.initialCapital,
    cash: eq?.cash ?? result.assumptions.initialCapital,
    drawdown: eq?.drawdown ?? 0,
    exposure: eq?.exposure ?? 0,
    open,
    openPnl,
    openPnlPct,
    realisedPnl: realised,
    events: visibleEvents,
    lastNote,
    fillBarEntry,
    fillBarExit,
    indicatorValues,
  };
}

/** Index of the next event strictly after the cursor's time, or null. */
export function nextEventIndex(candles: Candle[], events: ReplayEvent[], cursor: number): number | null {
  const time = candles[cursor]?.time ?? -Infinity;
  const next = events.find((e) => e.time > time);
  if (!next) return null;
  const idx = candles.findIndex((c) => c.time === next.time);
  return idx === -1 ? null : idx;
}

export function prevEventIndex(candles: Candle[], events: ReplayEvent[], cursor: number): number | null {
  const time = candles[cursor]?.time ?? Infinity;
  for (let k = events.length - 1; k >= 0; k--) {
    if (events[k].time < time) {
      const idx = candles.findIndex((c) => c.time === events[k].time);
      return idx === -1 ? null : idx;
    }
  }
  return null;
}
