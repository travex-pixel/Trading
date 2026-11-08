/**
 * Command Centre derivations: watchlist rows, regime, leaderboard from the
 * journal's stored results, deterioration detection and honest alerts. Pure
 * functions over engine output and stored records.
 */

import { defaultPeriod, riskAdjustedScore } from "@/lib/lab/run";
import { runBacktest } from "@/lib/quant/backtest";
import type { PaperState } from "@/lib/quant/paper";
import type { CandleSeries, PerformanceMetrics } from "@/lib/quant/types";
import { classifyRegimes, REGIME_LABELS, type Period, type Regime, type Verdict } from "@/lib/quant/validation";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { Experiment } from "@/lib/store/types";
import { currencyOf, getInstrument, marketOf } from "@/lib/market/instruments";
import type { Currency } from "@/lib/format";

const DAY = 86_400_000;

/** The ASX watchlist the home page opens on: the index ETF plus three bellwethers. */
export const HOME_WATCHLIST = ["ASX:STW", "ASX:CBA", "ASX:BHP", "ASX:CSL"] as const;
export const HOME_TIMEFRAME = "1d" as const;

/* ------------------------------------------------------------------------- */
/* Watchlist                                                                  */
/* ------------------------------------------------------------------------- */

export interface MarketRow {
  asset: string;
  symbol: string;
  name: string;
  currency: Currency;
  last: number;
  lastTime: number;
  change1dPct: number | null;
  change1mPct: number | null;
  change1yPct: number | null;
  closes: number[];
}

function changeOverBars(series: CandleSeries, bars: number): number | null {
  const c = series.candles;
  if (c.length <= bars) return null;
  const base = c[c.length - 1 - bars].close;
  return base > 0 ? (c[c.length - 1].close / base - 1) * 100 : null;
}

export function marketRows(series: CandleSeries[]): MarketRow[] {
  return series
    .filter((s) => s.candles.length > 0)
    .map((s) => {
      const inst = getInstrument(s.asset);
      const last = s.candles[s.candles.length - 1];
      return {
        asset: s.asset,
        symbol: inst?.symbol ?? s.asset,
        name: inst?.name ?? s.asset,
        currency: s.currency,
        last: last.close,
        lastTime: last.time,
        change1dPct: changeOverBars(s, 1),
        change1mPct: changeOverBars(s, 21),
        change1yPct: changeOverBars(s, 252),
        closes: s.candles.slice(-60).map((c) => c.close),
      };
    });
}

export interface RegimeSummary {
  regime: Regime;
  label: string;
  sentence: string;
  /** Bars the current regime has persisted. */
  barsPersisted: number;
  symbol: string;
}

const REGIME_SENTENCES: Record<Regime, string> = {
  uptrend: "The index is above a rising trend. Trend-following rules are in their element, while mean-reversion entries fight the tide.",
  downtrend: "The index is below a falling trend. Long-only strategies sit in cash or bleed, and buy and hold is taking the full fall.",
  sideways: "No clear trend in the index. Crossover and breakout rules whipsaw here, so mean reversion has the best odds.",
  high_volatility: "Index volatility is far above its norm. Stops get hit, fills slip, and every backtest assumption is under stress.",
};

export function regimeSummary(series: CandleSeries): RegimeSummary | null {
  const regimes = classifyRegimes(series);
  let i = regimes.length - 1;
  while (i >= 0 && regimes[i] === null) i--;
  if (i < 0) return null;
  const current = regimes[i]!;
  let persisted = 1;
  for (let j = i - 1; j >= 0 && regimes[j] === current; j--) persisted++;
  return { regime: current, label: REGIME_LABELS[current], sentence: REGIME_SENTENCES[current], barsPersisted: persisted, symbol: getInstrument(series.asset)?.symbol ?? series.asset };
}

/* ------------------------------------------------------------------------- */
/* Leaderboard                                                                */
/* ------------------------------------------------------------------------- */

export interface LeaderboardRow {
  id: string;
  name: string;
  /** Link target: a journal entry or a library kind. */
  href: string;
  config: StrategyConfig;
  instrumentLabel: string;
  currency: Currency;
  metrics: PerformanceMetrics;
  benchmarkReturnPct: number | null;
  verdict: Verdict | null;
  testedAt: number | null;
  score: number | null;
  /** Current drawdown from the running peak, as a positive percentage. */
  currentDrawdownPct: number;
  recent60dPct: number | null;
  prior60dPct: number | null;
  deteriorating: boolean;
  source: "journal" | "library";
}

export function latestPerLineage(experiments: Experiment[]): Experiment[] {
  const byLineage = new Map<string, Experiment>();
  for (const e of experiments) {
    const cur = byLineage.get(e.lineageId);
    if (!cur || e.version > cur.version) byLineage.set(e.lineageId, e);
  }
  return [...byLineage.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function returnBetween(equity: ReadonlyArray<{ time: number; equity: number }>, from: number, to: number): number | null {
  let start: { time: number; equity: number } | null = null;
  let end: { time: number; equity: number } | null = null;
  for (const p of equity) {
    if (p.time <= from) start = p;
    if (p.time <= to) end = p;
  }
  if (!start || !end || start === end || start.equity <= 0) return null;
  return (end.equity / start.equity - 1) * 100;
}

export function deteriorationSignals(equity: ReadonlyArray<{ time: number; equity: number }>): { currentDrawdownPct: number; recent60dPct: number | null; prior60dPct: number | null; deteriorating: boolean } {
  if (equity.length === 0) return { currentDrawdownPct: 0, recent60dPct: null, prior60dPct: null, deteriorating: false };
  let peak = -Infinity;
  for (const p of equity) if (p.equity > peak) peak = p.equity;
  const last = equity[equity.length - 1];
  const currentDrawdownPct = peak > 0 ? ((peak - last.equity) / peak) * 100 : 0;
  const end = last.time;
  const recent60dPct = returnBetween(equity, end - 60 * DAY, end);
  const prior60dPct = returnBetween(equity, end - 120 * DAY, end - 60 * DAY);
  const rolledOver = recent60dPct !== null && prior60dPct !== null && recent60dPct < 0 && prior60dPct > 0;
  return { currentDrawdownPct, recent60dPct, prior60dPct, deteriorating: rolledOver || currentDrawdownPct > 20 };
}

function instrumentLabelFor(config: StrategyConfig): string {
  const symbols = config.assets.map((a) => getInstrument(a)?.symbol ?? a);
  return `${symbols.join("+")} · ${marketOf(config.assets[0])}`;
}

/**
 * The leaderboard. With journal entries it uses each experiment's STORED
 * result (the figures the user saw when they saved it), so rows on different
 * markets and timeframes are shown honestly as tested rather than recomputed
 * on one dataset. With an empty journal it runs the library defaults on the
 * supplied series so a new user sees something real.
 */
export function buildLeaderboard(experiments: Experiment[], librarySeries: CandleSeries[] | null): { rows: LeaderboardRow[]; source: "journal" | "library"; period: Period | null } {
  const latest = latestPerLineage(experiments);
  if (latest.length > 0) {
    const rows: LeaderboardRow[] = latest.map((e) => {
      const det = deteriorationSignals(e.result.equity);
      const m = e.result.metrics;
      const score = m.sharpe ?? (m.maxDrawdownPct > 0 ? m.totalReturnPct / m.maxDrawdownPct : null);
      return {
        id: e.id,
        name: e.name,
        href: `/journal/${e.id}`,
        config: e.config,
        instrumentLabel: instrumentLabelFor(e.config),
        currency: currencyOf(e.config.assets[0]),
        metrics: m,
        benchmarkReturnPct: e.result.benchmark?.metrics.totalReturnPct ?? null,
        verdict: e.result.verdict,
        testedAt: e.createdAt,
        score,
        ...det,
        source: "journal" as const,
      };
    });
    return finish(rows, "journal", null);
  }
  if (!librarySeries || librarySeries.length === 0) return { rows: [], source: "library", period: null };
  const p = defaultPeriod(librarySeries);
  const rows: LeaderboardRow[] = [];
  for (const k of STRATEGY_ORDER.filter((k) => !STRATEGY_LIBRARY[k].benchmark)) {
    const config: StrategyConfig = { ...STRATEGY_LIBRARY[k].defaults, timeframe: librarySeries[0].timeframe };
    try {
      const result = runBacktest(config, librarySeries, p);
      const det = deteriorationSignals(result.equity);
      rows.push({
        id: k,
        name: STRATEGY_LIBRARY[k].name,
        href: `/lab/build?kind=${k}`,
        config,
        instrumentLabel: instrumentLabelFor(config),
        currency: result.currency,
        metrics: result.metrics,
        benchmarkReturnPct: null,
        verdict: null,
        testedAt: null,
        score: riskAdjustedScore(result),
        ...det,
        source: "library",
      });
    } catch {
      // A config that cannot run on this data is left off the board.
    }
  }
  return finish(rows, "library", p);
}

function finish(rows: LeaderboardRow[], source: "journal" | "library", period: Period | null) {
  rows.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  // "Deteriorating" flags the one strategy rolling over hardest, not every drawdown.
  const worst = [...rows].filter((r) => r.deteriorating).sort((a, b) => (a.recent60dPct ?? 0) - (b.recent60dPct ?? 0))[0];
  for (const r of rows) r.deteriorating = worst !== undefined && r.id === worst.id;
  return { rows, source, period };
}

/* ------------------------------------------------------------------------- */
/* Alerts                                                                     */
/* ------------------------------------------------------------------------- */

export interface Alert {
  id: string;
  tone: "warn" | "down" | "annot";
  text: string;
  href?: string;
}

export function deriveAlerts(args: { rows: LeaderboardRow[]; experiments: Experiment[]; paper: PaperState[] }): Alert[] {
  const alerts: Alert[] = [];
  const { rows, experiments, paper } = args;

  for (const s of paper) {
    if (s.portfolio.status !== "running" || !s.result) continue;
    const dd = s.result.equity[s.result.equity.length - 1]?.drawdown ?? 0;
    if (dd > 0.15) alerts.push({ id: `pdd-${s.portfolio.id}`, tone: "down", text: `${s.portfolio.name} (simulated) is ${(dd * 100).toFixed(0)}% below its peak.`, href: `/paper?id=${s.portfolio.id}` });
  }
  const rolling = rows
    .filter((r) => r.recent60dPct !== null && r.prior60dPct !== null && r.recent60dPct < 0 && r.prior60dPct > 0)
    .sort((a, b) => (a.recent60dPct ?? 0) - (b.recent60dPct ?? 0))
    .slice(0, 2);
  for (const r of rolling) {
    alerts.push({ id: `roll-${r.id}`, tone: "warn", text: `${r.name} rolled over inside its test: ${r.recent60dPct!.toFixed(1)}% in the last 60 days after +${r.prior60dPct!.toFixed(1)}% before that.`, href: r.href });
  }
  const rollingIds = new Set(rolling.map((r) => r.id));
  const deep = rows.filter((r) => r.currentDrawdownPct > 20 && !rollingIds.has(r.id));
  if (deep.length === rows.length && rows.length > 1 && rolling.length === 0) {
    alerts.push({ id: "dd-all", tone: "warn", text: "Every strategy on the board ended its test more than 20% below its peak. The market, not the rules, did most of the work." });
  } else if (deep.length) {
    const r = deep.sort((a, b) => b.currentDrawdownPct - a.currentDrawdownPct)[0];
    alerts.push({ id: `dd-${r.id}`, tone: "warn", text: `${r.name} ended its test ${r.currentDrawdownPct.toFixed(0)}% below its peak.`, href: r.href });
  }
  if (experiments.length > 0) {
    const thin = experiments.filter((e) => (e.result.metrics.tradeCount ?? 0) < 30);
    if (thin.length) alerts.push({ id: "thin", tone: "annot", text: `${thin.length === 1 ? thin[0].name + " has" : thin.length + " experiments have"} fewer than 30 trades. The statistics are mostly noise.`, href: "/journal" });
    const unvalidated = experiments.every((e) => e.result.verdict === null || e.result.verdict === "unproven" || e.result.verdict === "fragile");
    if (unvalidated) alerts.push({ id: "unvalidated", tone: "annot", text: "No experiment has a verdict better than fragile yet. Run the full validation on your best idea.", href: "/journal" });
  } else {
    alerts.push({ id: "none", tone: "annot", text: "Nothing in the journal yet. Every idea you test should leave a record, even the failures.", href: "/lab/build" });
  }
  return alerts.slice(0, 4);
}
