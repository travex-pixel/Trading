"use client";

/**
 * Strategy signal monitoring: for each saved strategy, run its rules over the
 * most recent data and report whether a signal fired on the latest bars.
 * Signals come from the same deterministic engine as backtests; nothing here
 * is predicted or generated. With demo data, "latest" means the end of the
 * dataset, and the UI says so.
 */

import { useEffect, useState } from "react";
import { fetchCandles } from "@/lib/market/client";
import { runBacktest } from "@/lib/quant/backtest";
import { computePaperState, type PaperPortfolio, type PaperState } from "@/lib/quant/paper";
import type { CandleSeries, SignalRecord } from "@/lib/quant/types";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { Experiment } from "@/lib/store/types";
import { getInstrument, marketOf } from "@/lib/market/instruments";
import { marketStatus } from "@/lib/market/calendar";

export interface LiveSignal {
  id: string;
  name: string;
  href: string;
  instrument: string;
  market: string;
  /** "buy" when the latest decision was to enter, "sell" to exit. */
  side: "buy" | "sell";
  time: number;
  /** Price at the bar where the signal was decided. */
  price: number;
  currency: string;
  reason: string;
  /** Position size the configured rules would use, as a fraction of equity. */
  sizeFraction: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  /** Bars since the signal; 0 means the latest bar. */
  barsAgo: number;
  isSynthetic: boolean;
  marketOpen: boolean;
}

const RECENT_BARS = 3;

function groupKey(config: StrategyConfig): string {
  return `${[...config.assets].sort().join(",")}|${config.timeframe}`;
}

function sizeFraction(config: StrategyConfig): number | null {
  const s = config.risk.sizing;
  if (s.mode === "fixed_fraction") return s.fraction;
  if (s.mode === "fixed_cash") return Math.min(1, s.amount / config.initialCapital);
  return null;
}

/** Evaluate one configuration against its series and return the latest recent signal, if any. */
export function latestSignal(entry: { id: string; name: string; href: string; config: StrategyConfig }, series: CandleSeries[]): LiveSignal | null {
  const ref = series.find((s) => s.asset === entry.config.assets[0]) ?? series[0];
  if (!ref || ref.candles.length < 50) return null;
  const end = ref.candles[ref.candles.length - 1].time;
  const start = Math.max(ref.candles[0].time, end - 2 * 365 * 86_400_000);
  let result;
  try {
    result = runBacktest(entry.config, series, { start, end });
  } catch {
    return null;
  }
  const lastIdx = result.equity.length - 1;
  const recent: SignalRecord[] = result.signals.filter((s) => s.index >= lastIdx - RECENT_BARS && Object.keys(s.targets).length > 0);
  const sig = recent[recent.length - 1];
  if (!sig) return null;
  const [asset, target] = Object.entries(sig.targets)[0] as [string, number];
  const inst = getInstrument(asset);
  const barAbs = ref.candles.findIndex((c) => c.time === sig.time);
  const price = barAbs >= 0 ? ref.candles[barAbs].close : ref.candles[ref.candles.length - 1].close;
  const market = marketOf(asset);
  const status = marketStatus(market);
  return {
    id: entry.id,
    name: entry.name,
    href: entry.href,
    instrument: inst?.symbol ?? asset,
    market,
    side: target === 1 ? "buy" : "sell",
    time: sig.time,
    price,
    currency: ref.currency,
    reason: sig.note ?? "Strategy signal.",
    sizeFraction: sizeFraction(entry.config),
    stopLossPct: entry.config.risk.stopLossPct,
    takeProfitPct: entry.config.risk.takeProfitPct,
    barsAgo: lastIdx - sig.index,
    isSynthetic: ref.source.isSynthetic,
    marketOpen: status.state === "open" || status.state === "always_open",
  };
}

export interface MonitorState {
  signals: LiveSignal[];
  paper: PaperState[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch each distinct (instruments, timeframe) group once, then evaluate
 * signals for saved experiments and compute paper-portfolio states.
 */
export function useMonitor(experiments: Experiment[] | null, portfolios: PaperPortfolio[] | null): MonitorState {
  const [state, setState] = useState<MonitorState>({ signals: [], paper: [], loading: true, error: null });
  const expKey = experiments ? experiments.map((e) => e.id).join("|") : "";
  const pfKey = portfolios ? portfolios.map((p) => `${p.id}:${p.clock}:${p.status}`).join("|") : "";

  useEffect(() => {
    if (!experiments || !portfolios) return;
    let cancelled = false;
    const latestByLineage = new Map<string, Experiment>();
    for (const e of experiments) {
      const cur = latestByLineage.get(e.lineageId);
      if (!cur || e.version > cur.version) latestByLineage.set(e.lineageId, e);
    }
    const entries = [...latestByLineage.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    const groups = new Map<string, { assets: string[]; timeframe: StrategyConfig["timeframe"] }>();
    for (const e of entries) groups.set(groupKey(e.config), { assets: e.config.assets, timeframe: e.config.timeframe });
    for (const p of portfolios) groups.set(groupKey(p.config), { assets: p.config.assets, timeframe: p.config.timeframe });

    (async () => {
      try {
        const fetched = new Map<string, CandleSeries[]>();
        await Promise.all(
          [...groups.entries()].map(async ([key, g]) => {
            fetched.set(key, await fetchCandles(g.assets, g.timeframe));
          }),
        );
        if (cancelled) return;
        const signals: LiveSignal[] = [];
        for (const e of entries) {
          const series = fetched.get(groupKey(e.config));
          if (!series) continue;
          const s = latestSignal({ id: e.id, name: e.name, href: `/journal/${e.id}`, config: e.config }, series);
          if (s) signals.push(s);
        }
        const paper: PaperState[] = [];
        for (const p of portfolios) {
          const series = fetched.get(groupKey(p.config));
          if (!series) continue;
          try {
            paper.push(computePaperState(p, series));
          } catch {
            // skip portfolios whose data cannot be computed
          }
        }
        signals.sort((a, b) => a.barsAgo - b.barsAgo || b.time - a.time);
        setState({ signals, paper, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ signals: [], paper: [], loading: false, error: err instanceof Error ? err.message : "Could not load monitor data." });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expKey, pfKey, experiments === null, portfolios === null]);

  return state;
}
