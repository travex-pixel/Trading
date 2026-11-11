/**
 * Paper trading: a deterministic simulated portfolio that follows a strategy
 * forward in time.
 *
 * The simulation is a backtest that starts at the moment the portfolio was
 * created and ends at the latest bar available. Because the engine is
 * deterministic and never looks ahead, replaying from the start each time
 * yields exactly the same positions as a live incremental run would, with no
 * mutable state to drift or corrupt. In demo mode the user advances a
 * simulated clock; with a live provider the clock is the real one.
 *
 * Everything produced here is SIMULATED. No orders are sent anywhere.
 */

import type { StrategyConfig } from "@/lib/strategies/schema";
import { runBacktest } from "./backtest";
import type { AssetId, BacktestResult, CandleSeries, Trade } from "./types";

export interface PaperPortfolio {
  id: string;
  name: string;
  config: StrategyConfig;
  /** Timestamp (ms) of the bar at which trading began. */
  startedAt: number;
  /** Simulated "now" (ms). Only bars at or before this are visible. */
  clock: number;
  status: "running" | "stopped";
  stoppedAt: number | null;
  createdAt: number;
  /** Dataset version the portfolio has been following. */
  dataVersion: string;
}

export interface PaperPositionView {
  asset: AssetId;
  quantity: number;
  entryPrice: number;
  entryTime: number;
  markPrice: number;
  unrealisedPnl: number;
  unrealisedPct: number;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  entryReason: string;
}

export interface PaperOrderView {
  time: number;
  asset: AssetId;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  reason: string;
}

export interface PaperState {
  portfolio: PaperPortfolio;
  equity: number;
  cash: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalPnl: number;
  returnPct: number;
  positions: PaperPositionView[];
  orders: PaperOrderView[];
  closedTrades: Trade[];
  /** The underlying simulation result, for charts. */
  result: BacktestResult | null;
  /** Timestamp of the last bar the simulation has consumed. */
  lastBarTime: number | null;
  barsElapsed: number;
}

/** Bars visible at the portfolio clock: everything at or before `clock`. */
function visibleSeries(series: CandleSeries[], clock: number): CandleSeries[] {
  return series.map((s) => ({ ...s, candles: s.candles.filter((c) => c.time <= clock) }));
}

export function computePaperState(portfolio: PaperPortfolio, series: CandleSeries[]): PaperState {
  const clock = portfolio.status === "stopped" && portfolio.stoppedAt !== null ? portfolio.stoppedAt : portfolio.clock;
  const visible = visibleSeries(series, clock);
  const reference = visible[0];
  const empty: PaperState = {
    portfolio,
    equity: portfolio.config.initialCapital,
    cash: portfolio.config.initialCapital,
    realisedPnl: 0,
    unrealisedPnl: 0,
    totalPnl: 0,
    returnPct: 0,
    positions: [],
    orders: [],
    closedTrades: [],
    result: null,
    lastBarTime: null,
    barsElapsed: 0,
  };
  if (!reference || reference.candles.length === 0) return empty;
  const firstIdx = reference.candles.findIndex((c) => c.time >= portfolio.startedAt);
  if (firstIdx === -1 || reference.candles.length - firstIdx < 2) return empty;

  // A running portfolio keeps its positions open at the latest bar. A stopped
  // one has been closed out, so the engine liquidates it like any backtest.
  const running = portfolio.status === "running";
  const result = runBacktest(portfolio.config, visible, { start: portfolio.startedAt, liquidateAtEnd: !running });
  const lastIdx = reference.candles.length - 1;
  const lastBar = reference.candles[lastIdx];

  const closed = result.trades;
  const positions: PaperPositionView[] = result.openPositions.map((p) => {
    const mark = visible.find((x) => x.asset === p.asset)!.candles[lastIdx].close;
    return {
      asset: p.asset,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      entryTime: p.entryTime,
      markPrice: mark,
      // Net of the brokerage already paid to open it, so realised plus unrealised equals the change in the account.
      unrealisedPnl: p.quantity * (mark - p.entryPrice) - p.entryFees,
      unrealisedPct: p.entryPrice > 0 ? (mark / p.entryPrice - 1) * 100 : 0,
      // The stop the engine actually holds, including any trailing it has done.
      stopPrice: p.stopPrice,
      takeProfitPrice: p.takeProfitPrice,
      entryReason: p.entryReason,
    };
  });

  const orders: PaperOrderView[] = [];
  for (const t of result.trades) {
    orders.push({ time: t.entryTime, asset: t.asset, side: "buy", quantity: t.quantity, price: t.entryPrice, fee: t.entryFees, reason: t.entryReason });
    orders.push({ time: t.exitTime, asset: t.asset, side: "sell", quantity: t.quantity, price: t.exitPrice, fee: t.fees - t.entryFees, reason: t.exitReasonText });
  }
  for (const p of result.openPositions) {
    orders.push({ time: p.entryTime, asset: p.asset, side: "buy", quantity: p.quantity, price: p.entryPrice, fee: p.entryFees, reason: p.entryReason });
  }
  orders.sort((a, b) => a.time - b.time);

  const realised = closed.reduce((s, t) => s + t.pnl, 0);
  const unrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const equityPoint = result.equity[result.equity.length - 1];
  const equity = equityPoint ? equityPoint.equity : portfolio.config.initialCapital;

  return {
    portfolio,
    equity,
    cash: equityPoint ? equityPoint.cash : portfolio.config.initialCapital,
    realisedPnl: realised,
    unrealisedPnl: unrealised,
    totalPnl: equity - portfolio.config.initialCapital,
    returnPct: (equity / portfolio.config.initialCapital - 1) * 100,
    positions,
    orders,
    closedTrades: closed,
    result,
    lastBarTime: lastBar.time,
    barsElapsed: result.equity.length,
  };
}

/** Advance the simulated clock by a number of bars worth of time, never beyond the data. */
export function advanceClock(portfolio: PaperPortfolio, byMs: number, latestAvailable: number): PaperPortfolio {
  if (portfolio.status !== "running") return portfolio;
  return { ...portfolio, clock: Math.min(latestAvailable, portfolio.clock + byMs) };
}

export function stopPortfolio(portfolio: PaperPortfolio): PaperPortfolio {
  if (portfolio.status === "stopped") return portfolio;
  return { ...portfolio, status: "stopped", stoppedAt: portfolio.clock };
}
