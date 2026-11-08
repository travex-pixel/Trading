/**
 * Bar-by-bar backtesting engine.
 *
 * Execution model (documented assumptions):
 *  - The strategy is asked for a decision at each bar's CLOSE using only data
 *    up to and including that bar. Orders it generates fill at the NEXT bar's
 *    OPEN. The strategy never sees the bar in which it is filled.
 *  - Fills pay slippage (buy higher, sell lower) and a fee on notional.
 *  - Stops and take-profits are checked against each bar's high/low after
 *    opening fills. If a bar gaps through the level, the fill is the open.
 *    If both a stop and a take-profit are touched in one bar, the stop fills
 *    (the conservative choice).
 *  - Sells are processed before buys within a bar so rotation can fund itself.
 *  - Orders that cannot be funded are scaled down to available cash. Orders
 *    smaller than one unit of quote currency are skipped.
 *  - Positions still open at the end of the data are closed at the last close
 *    with exit fees charged, so reported trade P&L is conservative.
 *  - Long-only. Version one trades spot with no leverage or shorting.
 */

import { prepareStrategy } from "@/lib/strategies/library";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { StrategyContext } from "@/lib/strategies/runtime";
import { barsPerDay, barsPerYear } from "@/lib/market/calendar";
import { marketOf } from "@/lib/market/instruments";
import { atr } from "./indicators";
import { computeMetrics } from "./metrics";
import { hashSeed } from "./prng";
import type {
  AssetId,
  BacktestAssumptions,
  BacktestResult,
  Candle,
  CandleSeries,
  DataSource,
  EquityPoint,
  OpenPosition,
  ResultWarning,
  SignalRecord,
  Trade,
  TradeExitReason,
} from "./types";

export interface BacktestOptions {
  /** Inclusive start timestamp (ms). Defaults to the first bar after warm-up. */
  start?: number;
  /** Inclusive end timestamp (ms). Defaults to the last bar. */
  end?: number;
  /** Override the strategy name shown on results. */
  label?: string;
}

interface PendingOrder {
  asset: AssetId;
  side: "buy" | "sell";
  /** For buys: target notional in quote currency. For sells: full exit. */
  notional: number;
  reason: string;
  exitReason?: TradeExitReason;
}

const MIN_ORDER_NOTIONAL = 1;

export class BacktestError extends Error {}

function alignSeries(series: CandleSeries[], assets: AssetId[]): Record<AssetId, Candle[]> {
  const map = {} as Record<AssetId, Candle[]>;
  for (const asset of assets) {
    const s = series.find((x) => x.asset === asset);
    if (!s) throw new BacktestError(`No candle data for ${asset}.`);
    map[asset] = s.candles;
  }
  const first = map[assets[0]];
  for (const asset of assets) {
    const c = map[asset];
    if (c.length !== first.length) throw new BacktestError("Candle series are not aligned (different lengths).");
    for (let i = 0; i < c.length; i += Math.max(1, Math.floor(c.length / 50))) {
      if (c[i].time !== first[i].time) throw new BacktestError("Candle series are not aligned (timestamps differ).");
    }
  }
  return map;
}

/** Validate that candles are strictly increasing in time with no duplicates and sane OHLC. */
export function validateCandles(candles: Candle[]): ResultWarning[] {
  const warnings: ResultWarning[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i > 0 && c.time <= candles[i - 1].time) {
      throw new BacktestError(`Candles must be strictly increasing in time (index ${i}).`);
    }
    if (!(c.low <= c.open && c.low <= c.close && c.high >= c.open && c.high >= c.close) || c.low <= 0) {
      throw new BacktestError(`Invalid OHLC values at index ${i}.`);
    }
  }
  return warnings;
}

export function runBacktest(config: StrategyConfig, series: CandleSeries[], options: BacktestOptions = {}): BacktestResult {
  const assets = config.assets;
  const aligned = alignSeries(series, assets);
  const reference = aligned[assets[0]];
  if (reference.length === 0) throw new BacktestError("Empty dataset.");
  for (const asset of assets) validateCandles(aligned[asset]);
  const source: DataSource = series[0].source;

  const prepared = prepareStrategy(config, aligned);

  // Determine the trading window.
  const firstTradable = Math.min(reference.length - 1, prepared.warmupBars);
  let startIdx = firstTradable;
  if (options.start !== undefined) {
    const idx = reference.findIndex((c) => c.time >= options.start!);
    if (idx === -1) throw new BacktestError("Start is after the end of the data.");
    startIdx = Math.max(idx, 0);
  }
  let endIdx = reference.length - 1;
  if (options.end !== undefined) {
    let idx = -1;
    for (let i = reference.length - 1; i >= 0; i--) {
      if (reference[i].time <= options.end) {
        idx = i;
        break;
      }
    }
    if (idx === -1) throw new BacktestError("End is before the start of the data.");
    endIdx = idx;
  }
  if (endIdx < startIdx) throw new BacktestError("The selected period contains no bars.");

  const warnings: ResultWarning[] = [];
  if (startIdx < prepared.warmupBars) {
    warnings.push({
      code: "insufficient_history",
      severity: "info",
      message: `The strategy needs ${prepared.warmupBars} bars of history before its first signal, so the first ${
        prepared.warmupBars - startIdx
      } bars of this period were used for warm-up only.`,
    });
  }
  if (source.isSynthetic) {
    warnings.push({ code: "synthetic_data", severity: "info", message: "Results use the deterministic demo dataset, not live market data." });
  }

  const market = marketOf(assets[0]);
  const feeRate = config.costs.feeBps / 10_000;
  const feeFixed = config.costs.feeFixed ?? 0;
  const slipRate = config.costs.slippageBps / 10_000;
  const assumptions: BacktestAssumptions = {
    initialCapital: config.initialCapital,
    currency: series[0].currency,
    feeBps: config.costs.feeBps,
    slippageBps: config.costs.slippageBps,
    feeFixed,
    executionModel: "next_bar_open",
    intrabarPriority: "stop_first",
  };

  // Volatility sizing needs ATR per asset.
  const atrByAsset: Partial<Record<AssetId, (number | null)[]>> = {};
  if (config.risk.sizing.mode === "volatility_target") {
    for (const asset of assets) atrByAsset[asset] = atr(aligned[asset], config.risk.sizing.atrPeriod);
  }
  const barsInDay = barsPerDay(market, config.timeframe);

  let cash = config.initialCapital;
  const positions: Partial<Record<AssetId, OpenPosition>> = {};
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const signals: SignalRecord[] = [];
  let pending: PendingOrder[] = [];
  let tradeId = 1;
  let peak = config.initialCapital;

  const openCount = () => Object.values(positions).filter(Boolean).length;

  function closePosition(asset: AssetId, index: number, fillPrice: number, reason: TradeExitReason, reasonText: string): void {
    const pos = positions[asset];
    if (!pos) return;
    const gross = pos.quantity * fillPrice;
    const fee = gross * feeRate + feeFixed;
    cash += gross - fee;
    const entryNotional = pos.quantity * pos.entryPrice;
    const pnl = gross - fee - entryNotional - pos.entryFees;
    const candles = aligned[asset];
    trades.push({
      id: tradeId++,
      asset,
      entryIndex: pos.entryIndex,
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      quantity: pos.quantity,
      exitIndex: index,
      exitTime: candles[index].time,
      exitPrice: fillPrice,
      exitReason: reason,
      fees: pos.entryFees + fee,
      pnl,
      returnPct: entryNotional > 0 ? pnl / entryNotional : 0,
      holdingBars: index - pos.entryIndex,
      entryReason: pos.entryReason,
      exitReasonText: reasonText,
    });
    delete positions[asset];
  }

  function targetNotional(asset: AssetId, index: number, currentEquity: number): number {
    const sizing = config.risk.sizing;
    switch (sizing.mode) {
      case "fixed_fraction":
        return currentEquity * sizing.fraction;
      case "fixed_cash":
        return sizing.amount;
      case "volatility_target": {
        const a = atrByAsset[asset]?.[index];
        const price = aligned[asset][index].close;
        if (a === null || a === undefined || a <= 0 || price <= 0) return 0;
        const barVol = a / price;
        const dailyVol = barVol * Math.sqrt(barsInDay);
        const fraction = Math.min(sizing.maxFraction, sizing.targetDailyVolPct / 100 / dailyVol);
        return currentEquity * fraction;
      }
    }
  }

  function markEquity(index: number): number {
    let invested = 0;
    for (const asset of assets) {
      const pos = positions[asset];
      if (pos) invested += pos.quantity * aligned[asset][index].close;
    }
    return cash + invested;
  }

  for (let i = startIdx; i <= endIdx; i++) {
    // 1. Execute pending orders at this bar's open (sells first).
    if (pending.length > 0 && i > startIdx) {
      const sells = pending.filter((o) => o.side === "sell");
      const buys = pending.filter((o) => o.side === "buy");
      for (const order of sells) {
        const open = aligned[order.asset][i].open;
        const fill = open * (1 - slipRate);
        closePosition(order.asset, i, fill, order.exitReason ?? "signal", order.reason);
      }
      for (const order of buys) {
        if (positions[order.asset]) continue;
        if (openCount() >= config.risk.maxPositions) continue;
        const open = aligned[order.asset][i].open;
        const fill = open * (1 + slipRate);
        // Scale to what cash can fund including the proportional fee and the flat brokerage.
        const affordable = (cash - feeFixed) / (1 + feeRate);
        const notional = Math.min(order.notional, affordable);
        if (notional < MIN_ORDER_NOTIONAL) continue;
        const quantity = notional / fill;
        const fee = notional * feeRate + feeFixed;
        cash -= notional + fee;
        const stop = config.risk.stopLossPct !== null ? fill * (1 - config.risk.stopLossPct) : null;
        const tp = config.risk.takeProfitPct !== null ? fill * (1 + config.risk.takeProfitPct) : null;
        positions[order.asset] = {
          asset: order.asset,
          quantity,
          entryIndex: i,
          entryTime: aligned[order.asset][i].time,
          entryPrice: fill,
          entryFees: fee,
          entryReason: order.reason,
          stopPrice: stop,
          takeProfitPrice: tp,
        };
      }
      pending = [];
    }

    // 2. Intrabar risk checks on open positions.
    for (const asset of assets) {
      const pos = positions[asset];
      if (!pos) continue;
      const bar = aligned[asset][i];
      if (pos.stopPrice !== null && bar.low <= pos.stopPrice) {
        const fill = Math.min(bar.open, pos.stopPrice) * (1 - slipRate);
        closePosition(asset, i, fill, "stop_loss", `Stop loss at ${pos.stopPrice.toFixed(2)} was hit.`);
        continue;
      }
      if (pos.takeProfitPrice !== null && bar.high >= pos.takeProfitPrice) {
        const fill = Math.max(bar.open, pos.takeProfitPrice) * (1 - slipRate);
        closePosition(asset, i, fill, "take_profit", `Take profit at ${pos.takeProfitPrice.toFixed(2)} was reached.`);
      }
    }

    // 3. Mark to market at close.
    const eq = markEquity(i);
    if (eq > peak) peak = eq;
    equity.push({
      time: reference[i].time,
      equity: eq,
      cash,
      exposure: eq > 0 ? Math.max(0, Math.min(1, (eq - cash) / eq)) : 0,
      drawdown: peak > 0 ? (peak - eq) / peak : 0,
    });

    // 4. Ask the strategy what to hold next (it sees bars 0..i only).
    if (i === endIdx) break;
    const ctx: StrategyContext = { config, series: aligned, index: i, indicators: prepared.indicators, positions };
    const signal = prepared.signal(ctx);

    if (signal.stopUpdates) {
      for (const asset of assets) {
        const next = signal.stopUpdates[asset];
        const pos = positions[asset];
        if (next !== undefined && pos && (pos.stopPrice === null || next > pos.stopPrice)) pos.stopPrice = next;
      }
    }

    const targets: Partial<Record<AssetId, number>> = {};
    for (const asset of assets) {
      const t = signal.targets[asset];
      if (t === undefined) continue;
      targets[asset] = t;
      const pos = positions[asset];
      if (t === 1 && !pos) {
        pending.push({ asset, side: "buy", notional: targetNotional(asset, i, eq), reason: signal.note ?? "Strategy signal." });
      } else if (t === 0 && pos) {
        const isRotation = config.params.kind === "momentum_rotation";
        pending.push({ asset, side: "sell", notional: 0, reason: signal.note ?? "Strategy signal.", exitReason: isRotation ? "rotation" : "signal" });
      }
    }
    if (signal.note !== null || pending.length > 0) {
      signals.push({ index: i, time: reference[i].time, targets, note: signal.note });
    }
  }

  // Close anything still open at the final close.
  for (const asset of assets) {
    if (positions[asset]) {
      closePosition(asset, endIdx, aligned[asset][endIdx].close, "end_of_data", "Closed at the end of the data.");
    }
  }

  const { metrics, warnings: metricWarnings } = computeMetrics(equity, trades, barsPerYear(market, config.timeframe), config.initialCapital);
  warnings.push(...metricWarnings);

  // Expose only the window's slice of each indicator for charts.
  const indicators: Record<string, (number | null)[]> = {};
  for (const [key, series] of Object.entries(prepared.indicators)) indicators[key] = series.slice(startIdx, endIdx + 1);

  const idInput = JSON.stringify({ config, start: reference[startIdx].time, end: reference[endIdx].time, source: source.version });
  return {
    id: hashSeed(idInput).toString(16).padStart(8, "0"),
    strategyId: config.params.kind,
    strategyName: options.label ?? config.name,
    timeframe: config.timeframe,
    assets: [...assets],
    market,
    currency: series[0].currency,
    source,
    period: { start: reference[startIdx].time, end: reference[endIdx].time, bars: endIdx - startIdx + 1 },
    assumptions,
    equity,
    trades,
    signals,
    indicators,
    metrics,
    warnings,
  };
}

/** The window of candles a result covers, for charting alongside equity. */
export function windowCandles(series: CandleSeries, result: BacktestResult): Candle[] {
  const { start, end } = result.period;
  return series.candles.filter((c) => c.time >= start && c.time <= end);
}
