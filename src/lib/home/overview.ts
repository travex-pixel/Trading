/**
 * Command Centre derivations: market summary, leaderboard, deterioration
 * detection and honest alerts. Pure functions over engine output.
 */

import { defaultPeriod, riskAdjustedScore } from "@/lib/lab/run";
import { runBacktest } from "@/lib/quant/backtest";
import type { PaperState } from "@/lib/quant/paper";
import type { BacktestResult, CandleSeries, EquityPoint } from "@/lib/quant/types";
import { classifyRegimes, REGIME_LABELS, type Period, type Regime } from "@/lib/quant/validation";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyConfig } from "@/lib/strategies/schema";
import type { Experiment } from "@/lib/store/types";

const DAY = 86_400_000;

/* ------------------------------------------------------------------------- */
/* Market                                                                     */
/* ------------------------------------------------------------------------- */

export interface MarketRow {
  asset: CandleSeries["asset"];
  last: number;
  change24hPct: number | null;
  change7dPct: number | null;
  closes: number[];
}

function changeOver(series: CandleSeries, ms: number): number | null {
  const c = series.candles;
  if (c.length === 0) return null;
  const last = c[c.length - 1];
  const target = last.time - ms;
  let idx = -1;
  for (let i = c.length - 1; i >= 0; i--) {
    if (c[i].time <= target) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;
  const base = c[idx].close;
  return base > 0 ? (last.close / base - 1) * 100 : null;
}

export function marketRows(series: CandleSeries[]): MarketRow[] {
  return series.map((s) => ({
    asset: s.asset,
    last: s.candles[s.candles.length - 1]?.close ?? 0,
    change24hPct: changeOver(s, DAY),
    change7dPct: changeOver(s, 7 * DAY),
    closes: s.candles.slice(-7 * 6).map((c) => c.close),
  }));
}

export interface RegimeSummary {
  regime: Regime;
  label: string;
  sentence: string;
  /** Bars the current regime has persisted. */
  barsPersisted: number;
}

const REGIME_SENTENCES: Record<Regime, string> = {
  uptrend: "Price is above a rising trend. Trend-following rules are in their element; mean-reversion entries fight the tide.",
  downtrend: "Price is below a falling trend. Long-only strategies sit in cash or bleed; buy-and-hold is taking the full fall.",
  sideways: "No clear trend. Crossover and breakout rules whipsaw here; mean reversion has the best odds.",
  high_volatility: "Volatility is far above its norm. Stops get hit, fills slip, and every backtest assumption is under stress.",
};

export function regimeSummary(series: CandleSeries): RegimeSummary | null {
  const regimes = classifyRegimes(series);
  let i = regimes.length - 1;
  while (i >= 0 && regimes[i] === null) i--;
  if (i < 0) return null;
  const current = regimes[i]!;
  let persisted = 1;
  for (let j = i - 1; j >= 0 && regimes[j] === current; j--) persisted++;
  return { regime: current, label: REGIME_LABELS[current], sentence: REGIME_SENTENCES[current], barsPersisted: persisted };
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
  result: BacktestResult;
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

function returnBetween(equity: EquityPoint[], from: number, to: number): number | null {
  let start: EquityPoint | null = null;
  let end: EquityPoint | null = null;
  for (const p of equity) {
    if (p.time <= from) start = p;
    if (p.time <= to) end = p;
  }
  if (!start || !end || start === end || start.equity <= 0) return null;
  return (end.equity / start.equity - 1) * 100;
}

export function deteriorationSignals(equity: EquityPoint[]): { currentDrawdownPct: number; recent60dPct: number | null; prior60dPct: number | null; deteriorating: boolean } {
  if (equity.length === 0) return { currentDrawdownPct: 0, recent60dPct: null, prior60dPct: null, deteriorating: false };
  const last = equity[equity.length - 1];
  const currentDrawdownPct = last.drawdown * 100;
  const end = last.time;
  const recent60dPct = returnBetween(equity, end - 60 * DAY, end);
  const prior60dPct = returnBetween(equity, end - 120 * DAY, end - 60 * DAY);
  const rolledOver = recent60dPct !== null && prior60dPct !== null && recent60dPct < 0 && prior60dPct > 0;
  return { currentDrawdownPct, recent60dPct, prior60dPct, deteriorating: rolledOver || currentDrawdownPct > 20 };
}

export function buildLeaderboard(experiments: Experiment[], series: CandleSeries[], period?: Period): { rows: LeaderboardRow[]; source: "journal" | "library"; period: Period } {
  const p = period ?? defaultPeriod(series);
  const latest = latestPerLineage(experiments);
  const source: "journal" | "library" = latest.length > 0 ? "journal" : "library";
  const candidates: Array<{ id: string; name: string; href: string; config: StrategyConfig }> =
    source === "journal"
      ? latest.map((e) => ({ id: e.id, name: e.name, href: `/journal/${e.id}`, config: e.config }))
      : STRATEGY_ORDER.filter((k) => !STRATEGY_LIBRARY[k].benchmark).map((k) => ({ id: k, name: STRATEGY_LIBRARY[k].name, href: `/lab/build?kind=${k}`, config: STRATEGY_LIBRARY[k].defaults }));

  const rows: LeaderboardRow[] = [];
  for (const c of candidates) {
    // Leaderboard figures are recomputed on the home timeframe (4h) so all rows share one dataset.
    const config: StrategyConfig = { ...c.config, timeframe: series[0].timeframe };
    try {
      const result = runBacktest(config, series, p);
      const det = deteriorationSignals(result.equity);
      rows.push({ ...c, config, result, score: riskAdjustedScore(result), ...det, source });
    } catch {
      // A config that cannot run on this data is left off the board.
    }
  }
  rows.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  // "Deteriorating" is a flag for the one strategy that is rolling over hardest, not a label on every drawdown.
  const worst = [...rows].filter((r) => r.deteriorating).sort((a, b) => (a.recent60dPct ?? 0) - (b.recent60dPct ?? 0))[0];
  for (const r of rows) r.deteriorating = worst !== undefined && r.id === worst.id;
  return { rows, source, period: p };
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
    alerts.push({ id: `roll-${r.id}`, tone: "warn", text: `${r.name} rolled over: ${r.recent60dPct!.toFixed(1)}% in the last 60 days after +${r.prior60dPct!.toFixed(1)}% before that.`, href: r.href });
  }
  const rollingIds = new Set(rolling.map((r) => r.id));
  const deep = rows.filter((r) => r.currentDrawdownPct > 20 && !rollingIds.has(r.id));
  if (deep.length === rows.length && rows.length > 1 && rolling.length === 0) {
    alerts.push({ id: "dd-all", tone: "warn", text: `Every strategy on the board is more than 20% below its peak. The market, not the rules, is doing most of the work right now.` });
  } else if (deep.length) {
    const r = deep.sort((a, b) => b.currentDrawdownPct - a.currentDrawdownPct)[0];
    alerts.push({ id: `dd-${r.id}`, tone: "warn", text: `${r.name} is in a ${r.currentDrawdownPct.toFixed(0)}% drawdown from its peak.`, href: r.href });
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
