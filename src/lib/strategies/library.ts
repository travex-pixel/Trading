/**
 * The strategy library: metadata for the Strategy Lab plus the runtime
 * factory for each strategy kind.
 *
 * Every signal function reads only candles[0..index]. Indicators are
 * precomputed with causal functions, so reading indicator[index] is
 * equivalent to computing it from the visible history.
 */

import { atr, closes, donchian, ema, macd, rsi, sma, trailingReturn, type Series } from "@/lib/quant/indicators";
import { mulberry32 } from "@/lib/quant/prng";
import type { AssetId, Candle } from "@/lib/quant/types";
import { DEFAULT_MARKET, MARKETS, defaultInstrument, rotationPair } from "@/lib/market/instruments";
import type { StrategyConfig, StrategyKind, StrategyParams } from "./schema";
import { indicatorKey, type IndicatorDisplay, type PreparedStrategy, type StrategyContext, type StrategySignal } from "./runtime";

export interface StrategyMeta {
  kind: StrategyKind;
  name: string;
  /** One sentence a non-quant understands. */
  summary: string;
  explanation: string;
  entryRule: string;
  exitRule: string;
  weaknesses: string[];
  /** Whether it is a benchmark rather than an idea to improve. */
  benchmark: boolean;
  defaults: StrategyConfig;
}

const defaultRisk = {
  stopLossPct: null,
  takeProfitPct: null,
  sizing: { mode: "fixed_fraction" as const, fraction: 1 },
  maxPositions: 1,
};

const defaultCosts = { ...MARKETS[DEFAULT_MARKET].defaultCosts };

/** Library defaults are expressed for the default market (ASX) on daily bars: 20 bars is about a trading month. */
function base(name: string, params: StrategyParams, overrides: Partial<StrategyConfig> = {}): StrategyConfig {
  return {
    v: 1,
    name,
    assets: [defaultInstrument(DEFAULT_MARKET).id],
    timeframe: "1d",
    params,
    risk: defaultRisk,
    costs: defaultCosts,
    initialCapital: 10_000,
    ...overrides,
  };
}

export const STRATEGY_LIBRARY: Record<StrategyKind, StrategyMeta> = {
  ma_crossover: {
    kind: "ma_crossover",
    name: "Moving average crossover",
    summary: "Buy when the recent average price rises above the longer-term average. Sell when it falls back below.",
    explanation:
      "Two moving averages smooth the price over different windows. When the fast average crosses above the slow one, recent prices are rising faster than the longer trend, which the strategy reads as the start of an uptrend. It holds until the fast average crosses back below.",
    entryRule: "Fast average crosses above slow average.",
    exitRule: "Fast average crosses below slow average, or a stop or take-profit is hit.",
    weaknesses: [
      "Whipsaws badly in sideways markets: many small losses as the averages cross repeatedly.",
      "Always late. It enters after a move has started and exits after it has reversed.",
      "Results are sensitive to the two window lengths, which makes it easy to overfit.",
    ],
    benchmark: false,
    defaults: base("MA crossover 20/60", { kind: "ma_crossover", fast: 20, slow: 60, maType: "ema" }),
  },
  rsi_mean_reversion: {
    kind: "rsi_mean_reversion",
    name: "RSI mean reversion",
    summary: "Buy after a sharp fall, expecting a bounce. Sell once price has recovered.",
    explanation:
      "The Relative Strength Index measures how one-sided recent price moves have been, from 0 to 100. Readings below the oversold level mean selling has been intense. The strategy buys there, betting on a rebound, and exits when RSI climbs back to the overbought level.",
    entryRule: "RSI falls below the oversold threshold.",
    exitRule: "RSI rises above the overbought threshold, or a stop or take-profit is hit.",
    weaknesses: [
      "Catches falling knives in strong downtrends. Oversold can stay oversold.",
      "Needs a stop loss to survive crashes, and stops convert a few huge losses into many medium ones.",
      "Works best in ranges. In trends it sits in cash while price runs away.",
    ],
    benchmark: false,
    defaults: base(
      "RSI reversion 14",
      { kind: "rsi_mean_reversion", period: 14, oversold: 30, overbought: 60 },
      { risk: { ...defaultRisk, stopLossPct: 0.08 } },
    ),
  },
  macd_momentum: {
    kind: "macd_momentum",
    name: "MACD momentum",
    summary: "Buy when short-term momentum turns positive relative to its own trend. Sell when it turns negative.",
    explanation:
      "MACD is the gap between a fast and a slow exponential average. A signal line smooths that gap. When MACD crosses above its signal line, momentum is accelerating and the strategy buys. When it crosses below, momentum is fading and the strategy sells.",
    entryRule: "MACD line crosses above its signal line.",
    exitRule: "MACD line crosses below its signal line, or a stop or take-profit is hit.",
    weaknesses: [
      "Fires constantly in choppy markets, paying fees each time.",
      "Three parameters make it easy to tune to the past and hard to trust in the future.",
      "Lags turning points like every moving-average system.",
    ],
    benchmark: false,
    defaults: base("MACD 12/26/9", { kind: "macd_momentum", fast: 12, slow: 26, signal: 9 }),
  },
  breakout: {
    kind: "breakout",
    name: "Breakout",
    summary: "Buy when price breaks above its recent high. Sell when it drops below its recent low.",
    explanation:
      "A Donchian channel tracks the highest high and lowest low of the last N bars. Closing above the channel means price is doing something it has not done recently, which trend traders read as the start of a move. The exit channel uses a shorter window so the strategy gives back less when a trend ends.",
    entryRule: "Close exceeds the highest high of the lookback window.",
    exitRule: "Close falls below the lowest low of the exit window, or a stop or take-profit is hit.",
    weaknesses: [
      "False breakouts: price pokes above the range and immediately reverses.",
      "Buys at local highs by design, so entries feel uncomfortable and drawdowns start immediately.",
      "Long flat periods during ranges, with nothing to show for the waiting.",
    ],
    benchmark: false,
    defaults: base("Breakout 55/20", { kind: "breakout", lookback: 55, exitLookback: 20 }),
  },
  trend_following: {
    kind: "trend_following",
    name: "Trend following",
    summary: "Hold while price stays above its long-term average, with a trailing stop that tightens as volatility falls.",
    explanation:
      "The strategy is long whenever price closes above a long moving average, and it protects each position with a trailing stop set a multiple of the Average True Range below the highest close since entry. The stop only ever moves up, so a winning trade locks in gains as the trend matures.",
    entryRule: "Close is above the long moving average.",
    exitRule: "Trailing ATR stop is hit, or close falls below the moving average.",
    weaknesses: [
      "Gives back a meaningful share of every trend before the stop triggers.",
      "Repeatedly stopped out in volatile ranges.",
      "Long periods of underperformance against buy and hold in steady bull markets.",
    ],
    benchmark: false,
    defaults: base("Trend 100 / 3 ATR", { kind: "trend_following", maPeriod: 100, atrPeriod: 14, atrMultiple: 3 }),
  },
  volatility_breakout: {
    kind: "volatility_breakout",
    name: "Volatility breakout",
    summary: "Buy when price jumps more than usual in one bar, hold for a fixed number of bars, then exit.",
    explanation:
      "The strategy compares each bar's move with the recent Average True Range. A close more than K ATRs above the previous close is an unusually strong move. The strategy buys it and holds for a fixed horizon, betting the surge continues briefly.",
    entryRule: "Close minus previous close exceeds K times ATR.",
    exitRule: "Fixed holding period elapses, or a stop or take-profit is hit.",
    weaknesses: [
      "Buys exhaustion spikes as often as genuine breakouts.",
      "The fixed holding period ignores what the market does after entry.",
      "Highly sensitive to the ATR multiple. Small changes flip the result.",
    ],
    benchmark: false,
    defaults: base("Vol breakout 1.5 ATR", { kind: "volatility_breakout", atrPeriod: 14, atrMultiple: 1.5, holdBars: 5 }),
  },
  buy_and_hold: {
    kind: "buy_and_hold",
    name: "Buy and hold",
    summary: "Buy on the first bar and never sell. The benchmark every active strategy must beat.",
    explanation:
      "Buy and hold is the honest baseline. It pays fees once, is always exposed, and captures every rally and every crash. An active strategy that cannot beat it after costs on a risk-adjusted basis has not found an edge. It has found activity.",
    entryRule: "Buy on the first bar.",
    exitRule: "Never. Positions close only at the end of the data.",
    weaknesses: [
      "Suffers the full depth of every drawdown.",
      "Its results depend entirely on the start and end dates chosen.",
    ],
    benchmark: true,
    defaults: base("Buy and hold", { kind: "buy_and_hold" }),
  },
  momentum_rotation: {
    kind: "momentum_rotation",
    name: "Momentum rotation",
    summary: "Every few bars, move into whichever asset has risen most recently, or into cash if nothing has.",
    explanation:
      "At each rebalance the strategy ranks the assets by trailing return and holds only the leader, provided its return clears a minimum. If no asset qualifies it sits in cash. It is the simplest form of cross-sectional momentum.",
    entryRule: "At rebalance, the asset with the highest trailing return above the minimum.",
    exitRule: "At rebalance, when another asset leads or none qualifies.",
    weaknesses: [
      "With only two assets the choice is nearly binary, so there is little diversification.",
      "Rotates into assets just as their momentum peaks.",
      "Rebalance frequency and lookback are easy to overfit.",
    ],
    benchmark: false,
    defaults: base(
      "Rotation 60d",
      { kind: "momentum_rotation", lookback: 60, rebalanceBars: 21, minReturn: 0 },
      { assets: [...rotationPair(DEFAULT_MARKET)] },
    ),
  },
  tsmom: {
    kind: "tsmom",
    name: "Simple momentum",
    summary: "Hold when the asset is higher than it was N bars ago. Otherwise hold cash. A naive momentum benchmark.",
    explanation:
      "Time-series momentum asks one question: is price higher than it was N bars ago? If yes, be long. If no, be in cash. It is included as a benchmark because any more complex trend strategy should beat this one-line rule.",
    entryRule: "Trailing return over the lookback is positive.",
    exitRule: "Trailing return over the lookback turns negative.",
    weaknesses: ["Slow to react to crashes.", "Flips frequently when price hovers near its level from N bars ago."],
    benchmark: true,
    defaults: base("Momentum 90d", { kind: "tsmom", lookback: 90 }),
  },
  random_baseline: {
    kind: "random_baseline",
    name: "Random baseline",
    summary: "Flips a coin each bar to decide whether to be in the market. If your strategy cannot beat this, it has no edge.",
    explanation:
      "The random baseline switches between fully invested and cash at random. It has roughly half the market's exposure and pays fees on each flip. It exists to calibrate expectations: a strategy with an edge should beat random reliably, not occasionally.",
    entryRule: "Random flip to long.",
    exitRule: "Random flip to flat.",
    weaknesses: ["It has no edge by construction. That is the point."],
    benchmark: true,
    defaults: base("Random baseline", { kind: "random_baseline", seed: 7, flipProbability: 0.05 }),
  },
};

export const STRATEGY_ORDER: StrategyKind[] = [
  "ma_crossover",
  "rsi_mean_reversion",
  "macd_momentum",
  "breakout",
  "trend_following",
  "volatility_breakout",
  "momentum_rotation",
  "buy_and_hold",
  "tsmom",
  "random_baseline",
];

/* ------------------------------------------------------------------------- */
/* Runtime factories                                                          */
/* ------------------------------------------------------------------------- */

function fmt(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function at(series: Series | undefined, i: number): number | null {
  if (!series) return null;
  const v = series[i];
  return v === undefined ? null : v;
}

function singleAsset(config: StrategyConfig): AssetId {
  return config.assets[0];
}

function held(ctx: StrategyContext, asset: AssetId): boolean {
  return Boolean(ctx.positions[asset]);
}

/** A strategy that never produces a signal (used for unreachable configurations). */
function flatSignal(): StrategySignal {
  return { targets: {}, note: null };
}

function prepareMaCrossover(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "ma_crossover") throw new Error("wrong params");
  const asset = singleAsset(config);
  const c = closes(series[asset]);
  const fn = p.maType === "ema" ? ema : sma;
  const fastKey = indicatorKey(asset, "ma_fast");
  const slowKey = indicatorKey(asset, "ma_slow");
  const indicators = { [fastKey]: fn(c, p.fast), [slowKey]: fn(c, p.slow) };
  const display: IndicatorDisplay[] = [
    { key: fastKey, label: `${p.maType.toUpperCase()} ${p.fast}`, pane: "price" },
    { key: slowKey, label: `${p.maType.toUpperCase()} ${p.slow}`, pane: "price" },
  ];
  return {
    indicators,
    display,
    warmupBars: p.slow,
    signal(ctx) {
      const i = ctx.index;
      const f = at(indicators[fastKey], i);
      const s = at(indicators[slowKey], i);
      const pf = at(indicators[fastKey], i - 1);
      const ps = at(indicators[slowKey], i - 1);
      if (f === null || s === null || pf === null || ps === null) return flatSignal();
      const isHeld = held(ctx, asset);
      if (!isHeld && pf <= ps && f > s) {
        return { targets: { [asset]: 1 }, note: `Fast average ${fmt(f)} crossed above slow average ${fmt(s)}.` };
      }
      if (isHeld && pf >= ps && f < s) {
        return { targets: { [asset]: 0 }, note: `Fast average ${fmt(f)} crossed below slow average ${fmt(s)}.` };
      }
      return flatSignal();
    },
  };
}

function prepareRsi(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "rsi_mean_reversion") throw new Error("wrong params");
  const asset = singleAsset(config);
  const key = indicatorKey(asset, "rsi");
  const indicators = { [key]: rsi(closes(series[asset]), p.period) };
  return {
    indicators,
    display: [{ key, label: `RSI ${p.period}`, pane: "oscillator", levels: [p.oversold, p.overbought] }],
    warmupBars: p.period + 1,
    signal(ctx) {
      const v = at(indicators[key], ctx.index);
      if (v === null) return flatSignal();
      const isHeld = held(ctx, asset);
      if (!isHeld && v < p.oversold) {
        return { targets: { [asset]: 1 }, note: `RSI ${fmt(v, 1)} is below the oversold level ${p.oversold}: selling looks exhausted.` };
      }
      if (isHeld && v > p.overbought) {
        return { targets: { [asset]: 0 }, note: `RSI ${fmt(v, 1)} is above ${p.overbought}: the bounce has played out.` };
      }
      return flatSignal();
    },
  };
}

function prepareMacd(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "macd_momentum") throw new Error("wrong params");
  const asset = singleAsset(config);
  const m = macd(closes(series[asset]), p.fast, p.slow, p.signal);
  const macdKey = indicatorKey(asset, "macd");
  const sigKey = indicatorKey(asset, "macd_signal");
  const histKey = indicatorKey(asset, "macd_hist");
  const indicators = { [macdKey]: m.macd, [sigKey]: m.signal, [histKey]: m.histogram };
  return {
    indicators,
    display: [
      { key: macdKey, label: "MACD", pane: "oscillator", levels: [0] },
      { key: sigKey, label: "Signal", pane: "oscillator" },
    ],
    warmupBars: p.slow + p.signal,
    signal(ctx) {
      const i = ctx.index;
      const h = at(indicators[histKey], i);
      const ph = at(indicators[histKey], i - 1);
      if (h === null || ph === null) return flatSignal();
      const isHeld = held(ctx, asset);
      if (!isHeld && ph <= 0 && h > 0) {
        return { targets: { [asset]: 1 }, note: `MACD crossed above its signal line (histogram ${fmt(h)}): momentum is accelerating.` };
      }
      if (isHeld && ph >= 0 && h < 0) {
        return { targets: { [asset]: 0 }, note: `MACD crossed below its signal line (histogram ${fmt(h)}): momentum is fading.` };
      }
      return flatSignal();
    },
  };
}

function prepareBreakout(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "breakout") throw new Error("wrong params");
  const asset = singleAsset(config);
  const entry = donchian(series[asset], p.lookback);
  const exit = donchian(series[asset], p.exitLookback);
  const upKey = indicatorKey(asset, "donchian_upper");
  const loKey = indicatorKey(asset, "donchian_exit_lower");
  const indicators = { [upKey]: entry.upper, [loKey]: exit.lower };
  return {
    indicators,
    display: [
      { key: upKey, label: `${p.lookback}-bar high`, pane: "price" },
      { key: loKey, label: `${p.exitLookback}-bar low`, pane: "price" },
    ],
    warmupBars: Math.max(p.lookback, p.exitLookback) + 1,
    signal(ctx) {
      const i = ctx.index;
      const close = series[asset][i].close;
      const upper = at(indicators[upKey], i);
      const lower = at(indicators[loKey], i);
      if (upper === null || lower === null) return flatSignal();
      const isHeld = held(ctx, asset);
      if (!isHeld && close > upper) {
        return { targets: { [asset]: 1 }, note: `Close ${fmt(close)} broke above the ${p.lookback}-bar high ${fmt(upper)}.` };
      }
      if (isHeld && close < lower) {
        return { targets: { [asset]: 0 }, note: `Close ${fmt(close)} fell below the ${p.exitLookback}-bar low ${fmt(lower)}.` };
      }
      return flatSignal();
    },
  };
}

function prepareTrend(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "trend_following") throw new Error("wrong params");
  const asset = singleAsset(config);
  const candles = series[asset];
  const maKey = indicatorKey(asset, "ma");
  const atrKey = indicatorKey(asset, "atr");
  const indicators = { [maKey]: sma(closes(candles), p.maPeriod), [atrKey]: atr(candles, p.atrPeriod) };
  return {
    indicators,
    display: [{ key: maKey, label: `SMA ${p.maPeriod}`, pane: "price" }],
    warmupBars: Math.max(p.maPeriod, p.atrPeriod),
    signal(ctx) {
      const i = ctx.index;
      const close = candles[i].close;
      const ma = at(indicators[maKey], i);
      const a = at(indicators[atrKey], i);
      if (ma === null || a === null) return flatSignal();
      const pos = ctx.positions[asset];
      if (!pos && close > ma) {
        return {
          targets: { [asset]: 1 },
          note: `Close ${fmt(close)} is above the ${p.maPeriod}-bar average ${fmt(ma)}. Initial stop ${fmt(close - p.atrMultiple * a)} (${p.atrMultiple} ATR below).`,
          stopUpdates: { [asset]: close - p.atrMultiple * a },
        };
      }
      if (pos) {
        if (close < ma) {
          return { targets: { [asset]: 0 }, note: `Close ${fmt(close)} dropped below the ${p.maPeriod}-bar average ${fmt(ma)}.` };
        }
        const newStop = close - p.atrMultiple * a;
        if (pos.stopPrice === null || newStop > pos.stopPrice) {
          return { targets: {}, note: null, stopUpdates: { [asset]: newStop } };
        }
      }
      return flatSignal();
    },
  };
}

function prepareVolBreakout(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "volatility_breakout") throw new Error("wrong params");
  const asset = singleAsset(config);
  const candles = series[asset];
  const atrKey = indicatorKey(asset, "atr");
  const indicators = { [atrKey]: atr(candles, p.atrPeriod) };
  return {
    indicators,
    display: [],
    warmupBars: p.atrPeriod + 1,
    signal(ctx) {
      const i = ctx.index;
      if (i === 0) return flatSignal();
      const a = at(indicators[atrKey], i - 1);
      if (a === null) return flatSignal();
      const move = candles[i].close - candles[i - 1].close;
      const pos = ctx.positions[asset];
      if (!pos && move > p.atrMultiple * a) {
        return {
          targets: { [asset]: 1 },
          note: `Price jumped ${fmt(move)} in one bar, more than ${p.atrMultiple} × ATR (${fmt(a)}). Holding for ${p.holdBars} bars.`,
        };
      }
      if (pos && i - pos.entryIndex >= p.holdBars) {
        return { targets: { [asset]: 0 }, note: `Held for ${p.holdBars} bars. The holding period is over.` };
      }
      return flatSignal();
    },
  };
}

function prepareBuyAndHold(config: StrategyConfig): PreparedStrategy {
  const asset = singleAsset(config);
  return {
    indicators: {},
    display: [],
    warmupBars: 0,
    signal(ctx) {
      if (!held(ctx, asset)) return { targets: { [asset]: 1 }, note: "Buy and hold: entering on the first available bar." };
      return flatSignal();
    },
  };
}

function prepareRotation(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "momentum_rotation") throw new Error("wrong params");
  const indicators: Record<string, Series> = {};
  const display: IndicatorDisplay[] = [];
  for (const asset of config.assets) {
    const key = indicatorKey(asset, "trailing_return");
    indicators[key] = trailingReturn(closes(series[asset]), p.lookback);
    display.push({ key, label: `${asset} ${p.lookback}-bar return`, pane: "oscillator", levels: [0] });
  }
  return {
    indicators,
    display,
    warmupBars: p.lookback + 1,
    signal(ctx) {
      const i = ctx.index;
      if (i % p.rebalanceBars !== 0) return flatSignal();
      let best: AssetId | null = null;
      let bestRet = -Infinity;
      const parts: string[] = [];
      for (const asset of config.assets) {
        const r = at(indicators[indicatorKey(asset, "trailing_return")], i);
        if (r === null) return flatSignal();
        parts.push(`${asset} ${fmt(r * 100, 1)}%`);
        if (r > bestRet) {
          bestRet = r;
          best = asset;
        }
      }
      const targets: Partial<Record<AssetId, 0 | 1>> = {};
      for (const asset of config.assets) targets[asset] = 0;
      if (best && bestRet > p.minReturn) {
        targets[best] = 1;
        if (held(ctx, best) && config.assets.every((a) => a === best || !held(ctx, a))) {
          return { targets: {}, note: null };
        }
        return { targets, note: `Rebalance: ${parts.join(", ")}. Holding ${best}, the leader.` };
      }
      const anyHeld = config.assets.some((a) => held(ctx, a));
      if (!anyHeld) return { targets: {}, note: null };
      return { targets, note: `Rebalance: ${parts.join(", ")}. No asset clears the minimum, so the strategy moves to cash.` };
    },
  };
}

function prepareTsmom(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "tsmom") throw new Error("wrong params");
  const asset = singleAsset(config);
  const key = indicatorKey(asset, "trailing_return");
  const indicators = { [key]: trailingReturn(closes(series[asset]), p.lookback) };
  return {
    indicators,
    display: [{ key, label: `${p.lookback}-bar return`, pane: "oscillator", levels: [0] }],
    warmupBars: p.lookback + 1,
    signal(ctx) {
      const r = at(indicators[key], ctx.index);
      if (r === null) return flatSignal();
      const isHeld = held(ctx, asset);
      if (!isHeld && r > 0) return { targets: { [asset]: 1 }, note: `Price is ${fmt(r * 100, 1)}% above its level ${p.lookback} bars ago.` };
      if (isHeld && r <= 0) return { targets: { [asset]: 0 }, note: `Price is ${fmt(r * 100, 1)}% versus ${p.lookback} bars ago, so momentum is negative.` };
      return flatSignal();
    },
  };
}

function prepareRandom(config: StrategyConfig): PreparedStrategy {
  const p = config.params;
  if (p.kind !== "random_baseline") throw new Error("wrong params");
  const asset = singleAsset(config);
  // Pre-draw the random sequence so results are identical regardless of call order.
  const rng = mulberry32(p.seed);
  const draws: number[] = [];
  return {
    indicators: {},
    display: [],
    warmupBars: 0,
    signal(ctx) {
      const i = ctx.index;
      while (draws.length <= i) draws.push(rng());
      if (draws[i] >= p.flipProbability) return flatSignal();
      const isHeld = held(ctx, asset);
      return { targets: { [asset]: isHeld ? 0 : 1 }, note: isHeld ? "Coin flip: moving to cash." : "Coin flip: entering." };
    },
  };
}

export function prepareStrategy(config: StrategyConfig, series: Record<AssetId, Candle[]>): PreparedStrategy {
  switch (config.params.kind) {
    case "ma_crossover":
      return prepareMaCrossover(config, series);
    case "rsi_mean_reversion":
      return prepareRsi(config, series);
    case "macd_momentum":
      return prepareMacd(config, series);
    case "breakout":
      return prepareBreakout(config, series);
    case "trend_following":
      return prepareTrend(config, series);
    case "volatility_breakout":
      return prepareVolBreakout(config, series);
    case "buy_and_hold":
      return prepareBuyAndHold(config);
    case "momentum_rotation":
      return prepareRotation(config, series);
    case "tsmom":
      return prepareTsmom(config, series);
    case "random_baseline":
      return prepareRandom(config);
  }
}

export function strategyMeta(kind: StrategyKind): StrategyMeta {
  return STRATEGY_LIBRARY[kind];
}
