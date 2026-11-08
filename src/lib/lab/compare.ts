"use client";

/**
 * The compare basket: a small set of strategy configurations the user wants
 * to see side by side. Lives in localStorage, validated on read.
 */

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { strategyConfigSchema, type StrategyConfig } from "@/lib/strategies/schema";
import type { BacktestResult } from "@/lib/quant/types";

const KEY = "edgelab:v1:compare";
export const MAX_COMPARE = 5;

const basketSchema = z.array(z.object({ id: z.string().max(64), config: strategyConfigSchema })).max(MAX_COMPARE);
export type BasketItem = z.infer<typeof basketSchema>[number];

function read(): BasketItem[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (!raw) return [];
    const parsed = basketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function write(items: BasketItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("edgelab:compare"));
  } catch {
    // ignore
  }
}

export function useCompareBasket() {
  const [items, setItems] = useState<BasketItem[] | null>(null);
  useEffect(() => {
    setItems(read());
    const onChange = () => setItems(read());
    window.addEventListener("edgelab:compare", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("edgelab:compare", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const add = useCallback((config: StrategyConfig) => {
    const current = read();
    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const next = [...current.filter((i) => JSON.stringify(i.config) !== JSON.stringify(config)), { id, config }].slice(-MAX_COMPARE);
    write(next);
    return next.length;
  }, []);
  const remove = useCallback((id: string) => write(read().filter((i) => i.id !== id)), []);
  const clear = useCallback(() => write([]), []);
  const replace = useCallback((configs: StrategyConfig[]) => {
    write(configs.slice(0, MAX_COMPARE).map((config, i) => ({ id: `${i}-${Date.now().toString(36)}`, config })));
  }, []);
  return { items: items ?? [], loaded: items !== null, add, remove, clear, replace };
}

/* ------------------------------------------------------------------------- */
/* Plain-English trade-offs                                                   */
/* ------------------------------------------------------------------------- */

export function describeTradeoffs(results: Array<{ name: string; result: BacktestResult }>): string[] {
  if (results.length < 2) return [];
  const lines: string[] = [];
  const byReturn = [...results].sort((a, b) => b.result.metrics.totalReturnPct - a.result.metrics.totalReturnPct);
  const byDd = [...results].sort((a, b) => a.result.metrics.maxDrawdownPct - b.result.metrics.maxDrawdownPct);
  const withSharpe = results.filter((r) => r.result.metrics.sharpe !== null);
  const bySharpe = [...withSharpe].sort((a, b) => (b.result.metrics.sharpe ?? 0) - (a.result.metrics.sharpe ?? 0));

  const top = byReturn[0];
  lines.push(`${top.name} made the most money (${pct(top.result.metrics.totalReturnPct)}), but return alone does not make it the winner.`);
  if (bySharpe.length >= 2 && bySharpe[0].name !== top.name) {
    lines.push(`${bySharpe[0].name} earned more per unit of risk (Sharpe ${bySharpe[0].result.metrics.sharpe!.toFixed(2)} vs ${(top.result.metrics.sharpe ?? 0).toFixed(2)}).`);
  } else if (bySharpe.length >= 1 && bySharpe[0].name === top.name) {
    lines.push(`It also has the best risk-adjusted return (Sharpe ${bySharpe[0].result.metrics.sharpe!.toFixed(2)}), which is the stronger claim.`);
  }
  if (byDd[0].name !== top.name) {
    lines.push(`${byDd[0].name} had the shallowest worst fall (${byDd[0].result.metrics.maxDrawdownPct.toFixed(1)}% vs ${top.result.metrics.maxDrawdownPct.toFixed(1)}% for ${top.name}). Ask which drawdown you could actually sit through.`);
  }
  const fewTrades = results.filter((r) => r.result.metrics.tradeCount < 30 && r.result.metrics.tradeCount > 0);
  if (fewTrades.length) lines.push(`${fewTrades.map((r) => r.name).join(", ")} ${fewTrades.length === 1 ? "has" : "have"} fewer than 30 trades, so ${fewTrades.length === 1 ? "its" : "their"} statistics are mostly noise.`);
  const feeHeavy = results.filter((r) => r.result.metrics.totalFees > 0.1 * r.result.assumptions.initialCapital);
  if (feeHeavy.length) lines.push(`${feeHeavy.map((r) => r.name).join(", ")} paid more than 10% of starting capital in fees. Costs are a strategy's silent partner.`);
  const idle = results.filter((r) => r.result.metrics.exposurePct < 40);
  if (idle.length) lines.push(`${idle.map((r) => r.name).join(", ")} ${idle.length === 1 ? "was" : "were"} in cash more than 60% of the time. Lower exposure means lower drawdowns but also less of the market's return.`);
  return lines;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
