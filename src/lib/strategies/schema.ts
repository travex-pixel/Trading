/**
 * Strategy configuration schema.
 *
 * A strategy is DATA, never code. Users configure strategies through
 * structured controls; the server and client both validate configurations
 * against this schema before anything is executed. There is no path by which
 * user input becomes executable code.
 */

import { z } from "zod";
import { isInstrumentId, marketOf } from "@/lib/market/instruments";

/** Legacy ids from the crypto-only release map onto the new universe. */
const LEGACY_IDS: Record<string, string> = { BTC: "CRYPTO:BTC", ETH: "CRYPTO:ETH" };

export const assetIdSchema = z
  .string()
  .max(32)
  .transform((v) => LEGACY_IDS[v] ?? v)
  .refine((v) => isInstrumentId(v), { message: "Unknown instrument." });
export const timeframeSchema = z.enum(["1h", "4h", "1d"]);

const pct = (min: number, max: number) => z.number().min(min).max(max);

export const positionSizingSchema = z.discriminatedUnion("mode", [
  /** Invest a fixed fraction of current equity per position. */
  z.object({ mode: z.literal("fixed_fraction"), fraction: pct(0.01, 1) }),
  /** Invest a fixed amount of quote currency per position. */
  z.object({ mode: z.literal("fixed_cash"), amount: z.number().min(1).max(1_000_000_000) }),
  /**
   * Size so the position's expected daily volatility equals the target
   * percentage of equity, using ATR as the volatility estimate.
   */
  z.object({
    mode: z.literal("volatility_target"),
    targetDailyVolPct: pct(0.1, 10),
    atrPeriod: z.number().int().min(2).max(200),
    maxFraction: pct(0.05, 1),
  }),
]);

export type PositionSizing = z.infer<typeof positionSizingSchema>;

export const riskSchema = z.object({
  /** Stop loss as a fraction of entry price, e.g. 0.05 = 5%. null disables. */
  stopLossPct: pct(0.001, 0.9).nullable(),
  /** Take profit as a fraction of entry price. null disables. */
  takeProfitPct: pct(0.001, 10).nullable(),
  sizing: positionSizingSchema,
  /** Maximum simultaneous positions across assets. */
  maxPositions: z.number().int().min(1).max(10),
});

export type RiskConfig = z.infer<typeof riskSchema>;

export const costsSchema = z.object({
  /** Fee per side, in basis points. 10 bps = 0.10%. */
  feeBps: z.number().min(0).max(500),
  /** Slippage per side, in basis points. */
  slippageBps: z.number().min(0).max(500),
  /** Flat brokerage per order in the instrument's currency (the norm for Australian retail brokers). */
  feeFixed: z.number().min(0).max(1000).default(0),
});

export type CostsConfig = z.infer<typeof costsSchema>;

const period = (min: number, max: number) => z.number().int().min(min).max(max);

export const strategyParamsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ma_crossover"),
    fast: period(2, 200),
    slow: period(3, 400),
    maType: z.enum(["sma", "ema"]),
  }),
  z.object({
    kind: z.literal("rsi_mean_reversion"),
    period: period(2, 100),
    oversold: pct(1, 50),
    overbought: pct(50, 99),
  }),
  z.object({
    kind: z.literal("macd_momentum"),
    fast: period(2, 100),
    slow: period(3, 200),
    signal: period(2, 100),
  }),
  z.object({
    kind: z.literal("breakout"),
    lookback: period(5, 400),
    /** Exit when price closes below the lowest low of this many bars. */
    exitLookback: period(2, 400),
  }),
  z.object({
    kind: z.literal("trend_following"),
    maPeriod: period(5, 400),
    atrPeriod: period(2, 100),
    /** Trailing stop distance in ATR multiples. */
    atrMultiple: pct(0.5, 10),
  }),
  z.object({
    kind: z.literal("volatility_breakout"),
    atrPeriod: period(2, 100),
    /** Enter when close exceeds previous close plus this many ATRs. */
    atrMultiple: pct(0.1, 5),
    /** Hold for this many bars, then exit. */
    holdBars: period(1, 200),
  }),
  z.object({
    kind: z.literal("buy_and_hold"),
  }),
  z.object({
    kind: z.literal("momentum_rotation"),
    lookback: period(5, 400),
    /** Rebalance every N bars. */
    rebalanceBars: period(1, 200),
    /** Only hold the winner if its trailing return is above this fraction. */
    minReturn: z.number().min(-1).max(1),
  }),
  z.object({
    kind: z.literal("tsmom"),
    /** Long when the trailing return over this many bars is positive, otherwise cash. */
    lookback: period(5, 1000),
  }),
  z.object({
    kind: z.literal("random_baseline"),
    seed: z.number().int().min(0).max(2 ** 31 - 1),
    /** Probability per bar of flipping between flat and long. */
    flipProbability: pct(0.001, 1),
  }),
]);

export type StrategyParams = z.infer<typeof strategyParamsSchema>;
export type StrategyKind = StrategyParams["kind"];

export const STRATEGY_KINDS = strategyParamsSchema.options.map((o) => o.shape.kind.value) as StrategyKind[];

export const strategyConfigSchema = z
  .object({
    /** Schema version for forward compatibility of stored configs. */
    v: z.literal(1),
    name: z.string().trim().min(1).max(80),
    assets: z.array(assetIdSchema).min(1).max(4),
    timeframe: timeframeSchema,
    params: strategyParamsSchema,
    risk: riskSchema,
    costs: costsSchema,
    initialCapital: z.number().min(100).max(1_000_000_000),
  })
  .superRefine((cfg, ctx) => {
    const p = cfg.params;
    const markets = new Set(cfg.assets.map((a) => marketOf(a)));
    if (markets.size > 1) {
      ctx.addIssue({ code: "custom", path: ["assets"], message: "All instruments in one strategy must trade on the same market." });
    }
    if (new Set(cfg.assets).size !== cfg.assets.length) {
      ctx.addIssue({ code: "custom", path: ["assets"], message: "Instruments must be distinct." });
    }
    if (p.kind === "ma_crossover" && p.fast >= p.slow) {
      ctx.addIssue({ code: "custom", path: ["params", "fast"], message: "Fast period must be shorter than slow period." });
    }
    if (p.kind === "macd_momentum" && p.fast >= p.slow) {
      ctx.addIssue({ code: "custom", path: ["params", "fast"], message: "Fast period must be shorter than slow period." });
    }
    if (p.kind === "rsi_mean_reversion" && p.oversold >= p.overbought) {
      ctx.addIssue({ code: "custom", path: ["params", "oversold"], message: "Oversold must be below overbought." });
    }
    if (p.kind === "momentum_rotation" && cfg.assets.length < 2) {
      ctx.addIssue({ code: "custom", path: ["assets"], message: "Momentum rotation needs at least two assets." });
    }
    if (p.kind !== "momentum_rotation" && cfg.assets.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["assets"], message: "This strategy trades a single asset." });
    }
  });

export type StrategyConfig = z.infer<typeof strategyConfigSchema>;

export const backtestRequestSchema = z.object({
  config: strategyConfigSchema,
  /** Inclusive start timestamp (ms). */
  start: z.number().int().nonnegative(),
  /** Inclusive end timestamp (ms). */
  end: z.number().int().nonnegative(),
});

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;

/** Safe parse that returns a friendly error list instead of throwing. */
export function parseStrategyConfig(input: unknown): { ok: true; config: StrategyConfig } | { ok: false; errors: string[] } {
  const result = strategyConfigSchema.safeParse(input);
  if (result.success) return { ok: true, config: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`),
  };
}
