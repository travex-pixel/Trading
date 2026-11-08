/**
 * Journal helpers: grouping experiments into lineages (versions of one idea)
 * and describing what changed between versions.
 */

import type { Experiment } from "@/lib/store/types";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { DataSource } from "@/lib/quant/types";

export interface Lineage {
  lineageId: string;
  /** Versions sorted newest first. */
  versions: Experiment[];
  latest: Experiment;
}

export function groupLineages(experiments: Experiment[]): Lineage[] {
  const map = new Map<string, Experiment[]>();
  for (const e of experiments) {
    const list = map.get(e.lineageId) ?? [];
    list.push(e);
    map.set(e.lineageId, list);
  }
  const out: Lineage[] = [];
  for (const [lineageId, versions] of map) {
    versions.sort((a, b) => b.version - a.version || b.createdAt - a.createdAt);
    out.push({ lineageId, versions, latest: versions[0] });
  }
  out.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
  return out;
}

export interface ParamChange {
  key: string;
  from: string;
  to: string;
}

function flatten(config: StrategyConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config.params)) out[k] = String(v);
  out.assets = config.assets.join("+");
  out.timeframe = config.timeframe;
  out.stopLoss = config.risk.stopLossPct === null ? "none" : `${(config.risk.stopLossPct * 100).toFixed(1)}%`;
  out.takeProfit = config.risk.takeProfitPct === null ? "none" : `${(config.risk.takeProfitPct * 100).toFixed(1)}%`;
  out.sizing = describeSizing(config.risk.sizing);
  out.fee = `${config.costs.feeBps}bp`;
  out.slippage = `${config.costs.slippageBps}bp`;
  out.capital = `$${config.initialCapital}`;
  return out;
}

export function describeSizing(s: StrategyConfig["risk"]["sizing"]): string {
  switch (s.mode) {
    case "fixed_fraction":
      return `${Math.round(s.fraction * 100)}% of equity`;
    case "fixed_cash":
      return `$${s.amount} per position`;
    case "volatility_target":
      return `${s.targetDailyVolPct}% daily vol target (max ${Math.round(s.maxFraction * 100)}%)`;
  }
}

/** Keys whose values differ between two configs, with before/after as text. */
export function diffConfigs(previous: StrategyConfig, current: StrategyConfig): ParamChange[] {
  const a = flatten(previous);
  const b = flatten(current);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: ParamChange[] = [];
  for (const k of keys) {
    if (a[k] !== b[k]) out.push({ key: k, from: a[k] ?? "–", to: b[k] ?? "–" });
  }
  return out;
}

export const PARAM_LABELS: Record<string, string> = {
  kind: "Strategy",
  fast: "fast period",
  slow: "slow period",
  signal: "signal period",
  maType: "average type",
  period: "RSI period",
  oversold: "oversold level",
  overbought: "overbought level",
  lookback: "lookback",
  exitLookback: "exit lookback",
  maPeriod: "trend average",
  atrPeriod: "ATR period",
  atrMultiple: "ATR multiple",
  holdBars: "holding period",
  rebalanceBars: "rebalance interval",
  minReturn: "minimum return",
  seed: "seed",
  flipProbability: "flip probability",
  assets: "assets",
  timeframe: "timeframe",
  stopLoss: "stop loss",
  takeProfit: "take profit",
  sizing: "position sizing",
  fee: "fee",
  slippage: "slippage",
  capital: "capital",
};

export function describeChanges(changes: ParamChange[]): string {
  if (changes.length === 0) return "No parameter changes since the previous version. Only the period or the data differed.";
  const parts = changes.map((c) => `${PARAM_LABELS[c.key] ?? c.key} ${c.from} → ${c.to}`);
  return `Changed ${parts.join(", ")}.`;
}

export function experimentSource(e: Experiment): DataSource {
  const provider: DataSource["provider"] = e.dataset.provider === "coinbase" ? "coinbase" : e.dataset.provider === "eodhd" ? "eodhd" : "demo";
  return {
    provider,
    version: e.dataset.version,
    label: e.dataset.label,
    isSynthetic: e.dataset.isSynthetic,
    freshness: e.dataset.isSynthetic ? "simulated" : "historical",
    adjustment: provider === "eodhd" ? "splits_dividends" : provider === "demo" ? "none" : "unknown",
    asOf: null,
  };
}
