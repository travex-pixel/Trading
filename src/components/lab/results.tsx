"use client";

/**
 * Result views shared by the Lab, Arena, Journal and Paper screens.
 */

import { useMemo, useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { EquityChart, type EquitySeries } from "@/components/charts/equity-chart";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { FindingsList, VerdictBadge } from "@/components/ui/verdict";
import { fmtDate, fmtDuration, fmtInt, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass, type Currency } from "@/lib/format";
import { MARKETS } from "@/lib/market/instruments";
import type { LabRun } from "@/lib/lab/run";
import { METRIC_DEFINITIONS } from "@/lib/quant/metrics";
import type { BacktestResult, PerformanceMetrics, Timeframe } from "@/lib/quant/types";
import { REGIME_LABELS, type RegimePerformance, type SensitivityReport, type WalkForwardReport } from "@/lib/quant/validation";
import { cn } from "@/lib/utils";

export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/* ------------------------------------------------------------------------- */

export function ResultHero({ run }: { run: LabRun }) {
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const diff = m.totalReturnPct - b.totalReturnPct;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      <Stat
        label="Total return"
        value={fmtPct(m.totalReturnPct, { sign: true })}
        tone={m.totalReturnPct >= 0 ? "up" : "down"}
        size="lg"
        sub={
          <span className={signClass(diff)}>
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(1)} pts vs buy and hold
          </span>
        }
      />
      <Stat label="Max drawdown" value={fmtPct(-m.maxDrawdownPct)} tone="down" size="lg" sub={`vs ${fmtPct(-b.maxDrawdownPct)} buy and hold`} hint={METRIC_DEFINITIONS.maxDrawdownPct.plain} />
      <Stat
        label="Sharpe ratio"
        value={m.sharpe === null ? "–" : fmtNum(m.sharpe)}
        tone={m.sharpe === null ? "muted" : m.sharpe > 1 ? "up" : m.sharpe < 0 ? "down" : "neutral"}
        size="lg"
        sub={m.sharpe === null ? "Not enough data" : `vs ${b.sharpe === null ? "–" : fmtNum(b.sharpe)} buy and hold`}
        hint={METRIC_DEFINITIONS.sharpe.plain}
      />
      <Stat label="Trades" value={fmtInt(m.tradeCount)} size="lg" tone={m.tradeCount < 30 ? "warn" : "neutral"} sub={m.winRatePct === null ? "No completed trades" : `${fmtPct(m.winRatePct, { digits: 0 })} winners`} />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function EquityPanel({ run, title = "Equity curve", showBenchmarks = true, height = 280 }: { run: LabRun; title?: string; showBenchmarks?: boolean; height?: number }) {
  const [mode, setMode] = useState<"value" | "percent">("value");
  const series = useMemo<EquitySeries[]>(() => {
    const out: EquitySeries[] = [{ id: "strategy", name: run.config.name, points: run.result.equity, color: SERIES_COLORS[0] }];
    if (showBenchmarks) {
      out.push({ id: "bh", name: "Buy and hold", points: run.benchmarks.buyAndHold.equity, color: "var(--series-muted)", muted: true });
      out.push({ id: "mom", name: "Simple momentum", points: run.benchmarks.momentum.equity, color: "var(--series-muted)", muted: true });
    }
    return out;
  }, [run, showBenchmarks]);
  const m = run.result.metrics;
  const dd = useMemo(() => {
    if (m.maxDrawdownPeakTime === null || m.maxDrawdownTroughTime === null || m.maxDrawdownPct <= 0) return null;
    const peak = run.result.equity.find((p) => p.time === m.maxDrawdownPeakTime);
    const trough = run.result.equity.find((p) => p.time === m.maxDrawdownTroughTime);
    if (!peak || !trough) return null;
    return { peakTime: peak.time, troughTime: trough.time, peakEquity: peak.equity, troughEquity: trough.equity, label: `max DD ${fmtPct(-m.maxDrawdownPct)}` };
  }, [run, m]);
  return (
    <Panel>
      <PanelHeader
        title={title}
        description={showBenchmarks ? "Your strategy against buy and hold and simple momentum under identical costs." : undefined}
        aside={
          <div role="radiogroup" aria-label="Scale" className="inline-flex rounded-[var(--radius-sm)] border border-border p-0.5 text-2xs">
            {(["value", "percent"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn("rounded-[calc(var(--radius-sm)-2px)] px-2 py-0.5", mode === v ? "bg-ink text-ground" : "text-ink-2")}>
                {v === "value" ? "$" : "%"}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-2 pt-3 pb-1">
        <EquityChart series={series} mode={mode} height={height} drawdown={dd} currency={run.result.currency} />
      </div>
      <Legend series={series} />
      <ProvenancePlate
        source={run.result.source}
        period={run.result.period}
        bars={run.result.period.bars}
        timeframe={run.result.timeframe}
        feeBps={run.result.assumptions.feeBps}
        slippageBps={run.result.assumptions.slippageBps}
        feeFixed={run.result.assumptions.feeFixed}
        currency={run.result.currency}
        market={MARKETS[run.result.market].shortName}
      />
    </Panel>
  );
}

export function Legend({ series, className }: { series: EquitySeries[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-2xs text-ink-2", className)}>
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.muted ? "var(--series-muted)" : s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------- */

export function VerdictPanel({ run }: { run: LabRun }) {
  const a = run.assessment;
  return (
    <Panel>
      <PanelHeader title="Is this a real edge?" aside={<VerdictBadge verdict={a.verdict} />} />
      <PanelBody>
        <p className="text-sm text-ink leading-5">{a.headline}</p>
        <FindingsList findings={a.findings} className="mt-4" />
        {!run.validation ? (
          <p className="mt-4 text-xs text-ink-3">Run the full validation (walk-forward and parameter sensitivity) to test for overfitting.</p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

type MetricKey = keyof PerformanceMetrics;

const METRIC_ROWS: Array<{ key: MetricKey; fmt: (m: PerformanceMetrics, tf: Timeframe, ccy: Currency) => string; tone?: (m: PerformanceMetrics) => string }> = [
  { key: "totalReturnPct", fmt: (m) => fmtPct(m.totalReturnPct, { sign: true }), tone: (m) => signClass(m.totalReturnPct) },
  { key: "cagrPct", fmt: (m) => (m.cagrPct === null ? "–" : fmtPct(m.cagrPct, { sign: true })), tone: (m) => signClass(m.cagrPct) },
  { key: "maxDrawdownPct", fmt: (m) => fmtPct(-m.maxDrawdownPct), tone: () => "text-down" },
  { key: "sharpe", fmt: (m) => (m.sharpe === null ? "–" : fmtNum(m.sharpe)) },
  { key: "sortino", fmt: (m) => (m.sortino === null ? "–" : fmtNum(m.sortino)) },
  { key: "calmar", fmt: (m) => (m.calmar === null ? "–" : fmtNum(m.calmar)) },
  { key: "volatilityPct", fmt: (m) => (m.volatilityPct === null ? "–" : fmtPct(m.volatilityPct)) },
  { key: "tradeCount", fmt: (m) => fmtInt(m.tradeCount) },
  { key: "winRatePct", fmt: (m) => (m.winRatePct === null ? "–" : fmtPct(m.winRatePct, { digits: 0 })) },
  { key: "profitFactor", fmt: (m) => (m.profitFactor === null ? "–" : m.profitFactor === Infinity ? "∞" : fmtNum(m.profitFactor)) },
  { key: "avgTradeReturnPct", fmt: (m) => (m.avgTradeReturnPct === null ? "–" : fmtPct(m.avgTradeReturnPct, { sign: true, digits: 2 })), tone: (m) => signClass(m.avgTradeReturnPct) },
  { key: "avgHoldingBars", fmt: (m, tf) => fmtDuration(m.avgHoldingBars, tf) },
  { key: "exposurePct", fmt: (m) => fmtPct(m.exposurePct, { digits: 0 }) },
  { key: "totalFees", fmt: (m, _tf, ccy) => fmtMoney(m.totalFees, { currency: ccy }) },
  { key: "maxConsecutiveLosses", fmt: (m) => fmtInt(m.maxConsecutiveLosses) },
  { key: "finalEquity", fmt: (m, _tf, ccy) => fmtMoney(m.finalEquity, { currency: ccy }) },
];

export function MetricsTable({
  columns,
  timeframe,
  highlightFirst = true,
  compactRows,
  currency = "AUD",
}: {
  columns: Array<{ name: string; metrics: PerformanceMetrics; color?: string; currency?: Currency }>;
  timeframe: Timeframe;
  highlightFirst?: boolean;
  compactRows?: MetricKey[];
  /** Default currency for money cells; a column may override it. */
  currency?: Currency;
}) {
  const [showDefs, setShowDefs] = useState(false);
  const rows = compactRows ? METRIC_ROWS.filter((r) => compactRows.includes(r.key)) : METRIC_ROWS;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table min-w-[480px]">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {columns.map((c, i) => (
                <th key={i} scope="col" className="num">
                  <span className="inline-flex items-center gap-1.5">
                    {c.color ? <span className="inline-block size-2 rounded-sm" style={{ background: c.color }} aria-hidden /> : null}
                    <span className={cn(highlightFirst && i === 0 ? "text-ink" : "")}>{c.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const def = METRIC_DEFINITIONS[r.key];
              return (
                <tr key={r.key}>
                  <th scope="row" className="font-normal text-ink-2" title={def.plain}>
                    {def.label}
                  </th>
                  {columns.map((c, i) => (
                    <td key={i} className={cn("num", r.tone ? r.tone(c.metrics) : i === 0 && highlightFirst ? "text-ink" : "text-ink-2")}>
                      {r.fmt(c.metrics, timeframe, c.currency ?? currency)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setShowDefs((s) => !s)} className="mt-3 flex items-center gap-1 px-1 text-xs text-ink-2 hover:text-ink" aria-expanded={showDefs}>
        {showDefs ? <CaretDown className="size-3.5" aria-hidden /> : <CaretRight className="size-3.5" aria-hidden />}
        What these metrics mean
      </button>
      {showDefs ? (
        <dl className="mt-2 grid gap-x-6 gap-y-2 px-1 text-xs sm:grid-cols-2">
          {rows.map((r) => {
            const def = METRIC_DEFINITIONS[r.key];
            return (
              <div key={r.key}>
                <dt className="font-medium text-ink-2">{def.label}</dt>
                <dd className="text-ink-3 leading-4">
                  {def.plain}
                  {def.caveat ? <span className="text-warn"> {def.caveat}</span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function RegimeTable({ regimes }: { regimes: RegimePerformance[] }) {
  if (regimes.length === 0) return <p className="px-4 py-3 text-xs text-ink-3">Not enough history to classify regimes.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Market regime</th>
            <th scope="col" className="num">Share of time</th>
            <th scope="col" className="num">Strategy</th>
            <th scope="col" className="num">Market</th>
            <th scope="col" className="num">Invested</th>
          </tr>
        </thead>
        <tbody>
          {regimes.map((r) => (
            <tr key={r.regime}>
              <th scope="row" className="font-normal text-ink">
                {REGIME_LABELS[r.regime]}
              </th>
              <td className="num text-ink-2">{fmtPct(r.sharePct, { digits: 0 })}</td>
              <td className={cn("num", signClass(r.strategyReturnPct))}>{fmtPct(r.strategyReturnPct, { sign: true })}</td>
              <td className={cn("num", signClass(r.marketReturnPct))}>{fmtPct(r.marketReturnPct, { sign: true })}</td>
              <td className="num text-ink-2">{fmtPct(r.exposurePct, { digits: 0 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export function WalkForwardPanel({ report, config }: { report: WalkForwardReport; config: LabRun["config"] }) {
  const series = useMemo<EquitySeries[]>(
    () => [{ id: "oos", name: "Out-of-sample (stitched)", points: report.stitchedEquity, color: SERIES_COLORS[0] }],
    [report],
  );
  const walls = report.folds.map((f, i) => ({ time: f.test.start, label: `test ${i + 1}` }));
  const shade = report.folds.map((f) => ({ start: f.test.start, end: f.test.end }));
  const is = report.inSampleMetrics;
  const oos = report.stitchedMetrics;
  return (
    <Panel>
      <PanelHeader
        title="Walk-forward test"
        description={`Parameters re-chosen on each training window (objective: ${report.objective}), then traded forward on unseen data. ${report.evaluations} backtests.`}
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 pt-4 sm:grid-cols-4">
        <Stat label="In-sample Sharpe" value={is.sharpe === null ? "–" : fmtNum(is.sharpe)} size="sm" />
        <Stat label="Out-of-sample Sharpe" value={oos.sharpe === null ? "–" : fmtNum(oos.sharpe)} size="sm" tone={oos.sharpe === null ? "muted" : oos.sharpe > 0 ? "up" : "down"} />
        <Stat label="In-sample return" value={fmtPct(is.totalReturnPct, { sign: true })} size="sm" tone={is.totalReturnPct >= 0 ? "neutral" : "down"} />
        <Stat label="Out-of-sample return" value={fmtPct(oos.totalReturnPct, { sign: true })} size="sm" tone={oos.totalReturnPct >= 0 ? "up" : "down"} />
      </div>
      <div className="px-2 pt-3 pb-1">
        <EquityChart series={series} height={200} walls={walls} shade={shade} />
      </div>
      <div className="overflow-x-auto px-0 pb-2">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Fold</th>
              <th scope="col">Test window</th>
              <th scope="col">Chosen parameters</th>
              <th scope="col" className="num">Train Sharpe</th>
              <th scope="col" className="num">Test Sharpe</th>
              <th scope="col" className="num">Test return</th>
            </tr>
          </thead>
          <tbody>
            {report.folds.map((f, i) => (
              <tr key={i}>
                <td className="num text-ink-2">{i + 1}</td>
                <td className="num text-ink-2 whitespace-nowrap">
                  {fmtDate(f.test.start)} – {fmtDate(f.test.end)}
                </td>
                <td className="num text-ink-2">{describeParams(f.chosen)}</td>
                <td className="num text-ink-2">{f.trainMetrics.sharpe === null ? "–" : fmtNum(f.trainMetrics.sharpe)}</td>
                <td className={cn("num", f.testMetrics.sharpe === null ? "text-ink-3" : f.testMetrics.sharpe > 0 ? "text-up" : "text-down")}>{f.testMetrics.sharpe === null ? "–" : fmtNum(f.testMetrics.sharpe)}</td>
                <td className={cn("num", signClass(f.testMetrics.totalReturnPct))}>{fmtPct(f.testMetrics.totalReturnPct, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-3 text-2xs text-ink-3">
        Your chosen parameters: <span className="num text-ink-2">{describeParams(config.params)}</span>. If the re-chosen parameters wander and the out-of-sample curve is flat, the in-sample result was tuned to the past.
      </p>
    </Panel>
  );
}

export function describeParams(p: LabRun["config"]["params"]): string {
  const entries = Object.entries(p).filter(([k]) => k !== "kind" && k !== "maType");
  return entries.map(([k, v]) => `${k} ${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}`).join(" · ");
}

/* ------------------------------------------------------------------------- */

export function SensitivityPanel({ reports }: { reports: SensitivityReport[] }) {
  if (reports.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Parameter sensitivity" description="Each parameter nudged around your value while the others stay fixed. A real edge looks like a plateau. A spike at one exact setting is a warning." />
      <PanelBody className="grid gap-6 sm:grid-cols-2">
        {reports.map((r) => (
          <SensitivityBars key={r.param.key} report={r} />
        ))}
      </PanelBody>
    </Panel>
  );
}

function SensitivityBars({ report }: { report: SensitivityReport }) {
  const values = report.points.map((p) => (p.metrics ? (p.metrics.sharpe ?? p.metrics.totalReturnPct / Math.max(1, p.metrics.maxDrawdownPct)) : null));
  const finite = values.filter((v): v is number => v !== null);
  const max = Math.max(0.01, ...finite.map(Math.abs));
  const label = PARAM_NAMES[report.param.key] ?? report.param.key;
  const chosen = report.param.value;
  const W = 280;
  const H = 72;
  const n = report.points.length;
  const slot = W / n;
  const barW = Math.min(24, slot - 4);
  const zero = H / 2;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium text-ink-2">{label}</h3>
        <span className={cn("num text-2xs", report.stability >= 0.75 ? "text-up" : report.stability >= 0.5 ? "text-ink-2" : "text-warn")}>stability {Math.round(report.stability * 100)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-2 w-full" role="img" aria-label={`${label}: Sharpe by parameter value`}>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="var(--border)" strokeWidth="1" />
        {report.points.map((p, i) => {
          const v = values[i];
          const x = i * slot + (slot - barW) / 2;
          const isChosen = Math.abs(p.value - chosen) < 1e-9;
          if (v === null) return <rect key={i} x={x} y={zero - 1} width={barW} height={2} fill="var(--ink-4)" />;
          const h = (Math.abs(v) / max) * (H / 2 - 4);
          const y = v >= 0 ? zero - h : zero;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={Math.max(1, h)} rx={2} fill={isChosen ? "var(--annot)" : v >= 0 ? "var(--series-1)" : "var(--down)"} opacity={isChosen ? 1 : 0.55} />
              <text x={x + barW / 2} y={H + 12} fontSize="9" textAnchor="middle" fill={isChosen ? "var(--ink)" : "var(--ink-3)"} className="num">
                {Number.isInteger(p.value) ? p.value : p.value.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const PARAM_NAMES: Record<string, string> = {
  fast: "Fast period",
  slow: "Slow period",
  signal: "Signal period",
  period: "RSI period",
  oversold: "Oversold level",
  overbought: "Overbought level",
  lookback: "Lookback",
  exitLookback: "Exit lookback",
  maPeriod: "Trend average",
  atrMultiple: "ATR multiple",
  holdBars: "Holding period",
  rebalanceBars: "Rebalance interval",
};

/* ------------------------------------------------------------------------- */

export function TradesTable({ result, limit = 50 }: { result: BacktestResult; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const trades = useMemo(() => [...result.trades].reverse(), [result]);
  const shown = showAll ? trades : trades.slice(0, limit);
  if (trades.length === 0) return <p className="px-4 py-3 text-xs text-ink-3">No completed trades in this period.</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Asset</th>
              <th scope="col">Entry</th>
              <th scope="col">Exit</th>
              <th scope="col" className="num">Entry price</th>
              <th scope="col" className="num">Exit price</th>
              <th scope="col" className="num">Held</th>
              <th scope="col" className="num">P&amp;L</th>
              <th scope="col" className="num">Return</th>
              <th scope="col">Exit reason</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="num text-ink-3">{t.id}</td>
                <td className="text-ink-2">{t.asset}</td>
                <td className="num text-ink-2 whitespace-nowrap">{fmtDate(t.entryTime)}</td>
                <td className="num text-ink-2 whitespace-nowrap">{fmtDate(t.exitTime)}</td>
                <td className="num text-ink-2">{fmtPrice(t.entryPrice, result.currency)}</td>
                <td className="num text-ink-2">{fmtPrice(t.exitPrice, result.currency)}</td>
                <td className="num text-ink-2">{fmtDuration(t.holdingBars, result.timeframe)}</td>
                <td className={cn("num", signClass(t.pnl))}>{fmtMoney(t.pnl, { cents: Math.abs(t.pnl) < 100, currency: result.currency })}</td>
                <td className={cn("num", signClass(t.returnPct))}>{fmtPct(t.returnPct * 100, { sign: true })}</td>
                <td className="text-ink-3 text-xs">{EXIT_LABEL[t.exitReason]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trades.length > limit ? (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 px-4 text-xs text-ink-2 hover:text-ink">
          {showAll ? "Show fewer" : `Show all ${trades.length} trades`}
        </button>
      ) : null}
    </div>
  );
}

export const EXIT_LABEL: Record<BacktestResult["trades"][number]["exitReason"], string> = {
  signal: "Signal",
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  end_of_data: "End of period",
  rotation: "Rotation",
};

export function WarningsList({ result }: { result: BacktestResult }) {
  const warnings = result.warnings.filter((w) => w.code !== "synthetic_data");
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={i} className={cn("flex gap-2 text-xs leading-4", w.severity === "warning" ? "text-warn" : "text-ink-3")}>
          <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-current" />
          {w.message}
        </li>
      ))}
    </ul>
  );
}
