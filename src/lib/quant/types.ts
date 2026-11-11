/**
 * Core quantitative types shared by the data layer, strategies, backtester,
 * paper-trading simulator and UI. Everything here is plain data so it can be
 * serialised, cached, persisted and sent between server and client safely.
 */

/**
 * An instrument id in the form "MARKET:SYMBOL", e.g. "ASX:CBA", "US:AAPL",
 * "CRYPTO:BTC". The registry in src/lib/market/instruments.ts defines the
 * universe; the engine treats ids as opaque strings.
 */
export type AssetId = string;

export type Timeframe = "1h" | "4h" | "1d";

export const TIMEFRAMES: readonly Timeframe[] = ["1h", "4h", "1d"] as const;

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

/** A single OHLCV bar. `time` is the bar's opening timestamp in ms since epoch (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A candle series for one asset at one timeframe. */
export type MarketCode = "ASX" | "US" | "CRYPTO";
export type CurrencyCode = "AUD" | "USD";

export interface CandleSeries {
  asset: AssetId;
  market: MarketCode;
  currency: CurrencyCode;
  timeframe: Timeframe;
  candles: Candle[];
  /** Identifies where the data came from so results are reproducible. */
  source: DataSource;
}

export type DataFreshness = "simulated" | "historical" | "delayed" | "realtime";
export type PriceAdjustment = "none" | "splits" | "splits_dividends" | "unknown";

export interface DataSource {
  /** "demo" is the deterministic synthetic dataset. */
  provider: "demo" | "eodhd" | "coinbase";
  /** Dataset version. Bump when the generator or ingestion changes. */
  version: string;
  /** Human-readable label shown wherever the data appears. */
  label: string;
  isSynthetic: boolean;
  /** What kind of data this is, so the UI never presents one as another. */
  freshness: DataFreshness;
  /** How prices are adjusted for corporate actions. */
  adjustment: PriceAdjustment;
  /** When the data was fetched or generated (ms), for freshness labels. */
  asOf: number | null;
}

export type TradeExitReason = "signal" | "stop_loss" | "take_profit" | "end_of_data" | "rotation";

export interface Trade {
  id: number;
  asset: AssetId;
  /** Bar index at which the entry order filled. */
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  /** Signed quantity. Positive for long. Version one is long-only. */
  quantity: number;
  exitIndex: number;
  exitTime: number;
  exitPrice: number;
  exitReason: TradeExitReason;
  /** Fees paid on entry plus exit, in quote currency. */
  fees: number;
  /** The entry part of `fees`. The exit part is `fees - entryFees`. */
  entryFees: number;
  /** Realised profit after fees, in quote currency. */
  pnl: number;
  /** pnl divided by entry notional. */
  returnPct: number;
  holdingBars: number;
  /** Plain-English reason the strategy entered. */
  entryReason: string;
  /** Plain-English reason the position was closed. */
  exitReasonText: string;
}

export interface OpenPosition {
  asset: AssetId;
  quantity: number;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  entryFees: number;
  entryReason: string;
  stopPrice: number | null;
  takeProfitPrice: number | null;
}

export interface EquityPoint {
  time: number;
  equity: number;
  cash: number;
  /** Fraction of equity invested in risky assets, 0..1. */
  exposure: number;
  /** Drawdown from running peak, 0..1 (positive number). */
  drawdown: number;
}

/** Per-bar record used by Trade Replay to explain what the strategy saw. */
export interface SignalRecord {
  index: number;
  time: number;
  /** Target direction per asset: 0 flat, 1 long. */
  targets: Partial<Record<AssetId, number>>;
  /** Human-readable explanation from the strategy for this bar. */
  note: string | null;
}

export interface BacktestAssumptions {
  initialCapital: number;
  currency: CurrencyCode;
  feeBps: number;
  slippageBps: number;
  /** Flat brokerage per order in quote currency. */
  feeFixed: number;
  /** Orders generated at bar close execute at the next bar's open. */
  executionModel: "next_bar_open";
  /** If a stop and a take-profit are both touched within one bar, the stop fills. */
  intrabarPriority: "stop_first";
}

export interface BacktestResult {
  /** Stable identifier derived from inputs. */
  id: string;
  strategyId: string;
  strategyName: string;
  timeframe: Timeframe;
  assets: AssetId[];
  market: MarketCode;
  currency: CurrencyCode;
  source: DataSource;
  period: { start: number; end: number; bars: number };
  assumptions: BacktestAssumptions;
  equity: EquityPoint[];
  trades: Trade[];
  signals: SignalRecord[];
  /** Named indicator series aligned to candle index, for charts and replay. */
  indicators: Record<string, (number | null)[]>;
  metrics: PerformanceMetrics;
  warnings: ResultWarning[];
  /**
   * Positions still held at the final bar. Empty unless the run was asked to
   * keep positions open (paper trading); research runs close everything.
   */
  openPositions: OpenPositionSnapshot[];
}

/** A position exactly as the engine holds it, including any stop it has trailed. */
export interface OpenPositionSnapshot {
  asset: AssetId;
  quantity: number;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  entryFees: number;
  entryReason: string;
  stopPrice: number | null;
  takeProfitPrice: number | null;
}

export interface ResultWarning {
  code:
    | "insufficient_trades"
    | "insufficient_history"
    | "zero_variance"
    | "annualisation_unreliable"
    | "no_trades"
    | "synthetic_data"
    | "high_fee_sensitivity"
    | "long_flat_period";
  severity: "info" | "warning";
  message: string;
}

export interface PerformanceMetrics {
  totalReturnPct: number;
  /** Compound annual growth rate. null when the period is too short to annualise honestly. */
  cagrPct: number | null;
  maxDrawdownPct: number;
  /** Bars from peak to trough of the maximum drawdown. */
  maxDrawdownDurationBars: number;
  maxDrawdownPeakTime: number | null;
  maxDrawdownTroughTime: number | null;
  /** Annualised Sharpe using per-bar returns and a zero risk-free rate. null if not estimable. */
  sharpe: number | null;
  sortino: number | null;
  /** Annualised volatility of per-bar returns, as a percentage. */
  volatilityPct: number | null;
  calmar: number | null;
  tradeCount: number;
  winRatePct: number | null;
  profitFactor: number | null;
  avgTradeReturnPct: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  avgHoldingBars: number | null;
  /** Percentage of bars with a non-zero position. */
  exposurePct: number;
  totalFees: number;
  /** Longest run of consecutive losing trades. */
  maxConsecutiveLosses: number;
  finalEquity: number;
}

export interface Candidate {
  asset: AssetId;
  candles: Candle[];
}
