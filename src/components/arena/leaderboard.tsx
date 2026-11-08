"use client";

/**
 * The competition leaderboard: every participant run under identical rules,
 * ranked by risk-adjusted score, with a combined equity chart and an
 * expandable "how it operates" view per competitor.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EquityChart, type EquitySeries } from "@/components/charts/equity-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate, Cell } from "@/components/ui/provenance";
import { Legend, MetricsTable, describeParams } from "@/components/lab/results";
import { fmtInt, fmtNum, fmtPct, signClass } from "@/lib/format";
import { computeStandings, describeRules, type Standing } from "@/lib/arena/competition";
import { describeTradeoffs } from "@/lib/lab/compare";
import { useCandles } from "@/lib/market/client";
import { DEFAULT_MARKET, rotationPair } from "@/lib/market/instruments";
import { runBacktest } from "@/lib/quant/backtest";
import { buyAndHoldConfig } from "@/lib/quant/benchmarks";
import type { CandleSeries } from "@/lib/quant/types";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import type { Competition } from "@/lib/store/types";
import { cn } from "@/lib/utils";

export function useStandings(competition: Competition | null) {
  const assets = competition?.rules.assets ?? [...rotationPair(DEFAULT_MARKET)];
  const timeframe = competition?.rules.timeframe ?? "1d";
  const { series, error, loading } = useCandles(assets, timeframe);
  const standings = useMemo(() => (competition && series ? computeStandings(competition, series) : null), [competition, series]);
  return { standings, series, error, loading };
}

export function KindBadge({ kind }: { kind: Competition["participants"][number]["kind"] }) {
  if (kind === "you") return <Badge tone="annot">You</Badge>;
  if (kind === "invited") return <Badge tone="neutral">Invited</Badge>;
  return <Badge tone="muted" title="A seeded strategy added by EdgeLab, not a person.">Bot</Badge>;
}

export function Leaderboard({ competition, standings, series, error, loading }: { competition: Competition; standings: Standing[] | null; series: CandleSeries[] | null; error: string | null; loading: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  const equity = useMemo<EquitySeries[]>(() => {
    if (!standings) return [];
    return standings.filter((s) => s.result).map((s) => ({ id: s.participant.id, name: s.participant.name, points: s.result!.equity, color: s.color, muted: s.color === "var(--series-muted)" }));
  }, [standings]);

  const tradeoffs = useMemo(() => (standings ? describeTradeoffs(standings.filter((s) => s.result).map((s) => ({ name: s.participant.name, result: s.result! }))) : []), [standings]);

  if (error) return <ErrorState title="Market data unavailable" body={error} />;
  if (loading || !standings || !series) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const leader = standings[0];
  const byReturn = [...standings].filter((s) => s.result).sort((a, b) => b.result!.metrics.totalReturnPct - a.result!.metrics.totalReturnPct)[0];

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="Leaderboard"
          description={
            leader?.result
              ? byReturn && byReturn.participant.id !== leader.participant.id
                ? `${leader.participant.name} leads on risk-adjusted return. ${byReturn.participant.name} made more money but took more risk to do it.`
                : `${leader.participant.name} leads on both return and risk-adjusted return.`
              : "Ranked by return earned per unit of risk, not by return alone."
          }
        />
        <div className="overflow-x-auto">
          <table className="table [&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-3 sm:[&_th]:px-3">
            <thead>
              <tr>
                <th scope="col" className="w-6">#</th>
                <th scope="col">Competitor</th>
                <th scope="col" className="num">Return</th>
                <th scope="col" className="num">Max DD</th>
                <th scope="col" className="num hidden sm:table-cell">Win rate</th>
                <th scope="col" className="num" title="Sharpe ratio when estimable, otherwise return divided by max drawdown.">
                  Risk-adj.
                </th>
                <th scope="col" className="num hidden sm:table-cell">Trades</th>
                <th scope="col" className="hidden md:table-cell" aria-label="Equity sparkline" />
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const m = s.result?.metrics ?? null;
                const isOpen = open === s.participant.id;
                return (
                  <CompetitorRows key={s.participant.id} s={s} m={m} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : s.participant.id)} competition={competition} series={series} />
                );
              })}
            </tbody>
          </table>
        </div>
        <ProvenancePlate
          source={series[0].source}
          period={{ start: competition.rules.start, end: competition.rules.end }}
          timeframe={competition.rules.timeframe}
          bars={standings[0]?.result?.period.bars}
          feeBps={competition.rules.feeBps}
          slippageBps={competition.rules.slippageBps}
          extra={<Cell label="Capital" value={`$${competition.rules.initialCapital.toLocaleString("en-US")} each`} />}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Equity curves" description={`All competitors from the same start, rebased to 0%. ${describeRules(competition.rules)}.`} />
        <div className="px-2 pt-3 pb-1">
          <EquityChart series={equity} mode="percent" height={300} />
        </div>
        <Legend series={equity} />
      </Panel>

      {tradeoffs.length ? (
        <Panel>
          <PanelHeader title="Reading the board" description="The highest return is not automatically the winner." />
          <PanelBody>
            <ul className="space-y-2">
              {tradeoffs.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-ink-2 leading-5">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-annot" />
                  {t}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

function CompetitorRows({
  s,
  m,
  isOpen,
  onToggle,
  competition,
  series,
}: {
  s: Standing;
  m: Standing["result"] extends infer R ? (R extends { metrics: infer M } ? M | null : never) : never;
  isOpen: boolean;
  onToggle: () => void;
  competition: Competition;
  series: CandleSeries[];
}) {
  const detailId = `competitor-${s.participant.id}`;
  return (
    <>
      <tr className={cn("cursor-pointer hover:bg-hover", isOpen ? "bg-raised" : "")} onClick={onToggle}>
        <td className="num text-ink-3">{s.rank}</td>
        <td>
          <button type="button" aria-expanded={isOpen} aria-controls={detailId} className="flex items-center gap-2 text-left" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
            <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="font-medium text-ink leading-tight">{s.participant.name}</span>
            <KindBadge kind={s.participant.kind} />
          </button>
        </td>
        {m ? (
          <>
            <td className={cn("num", signClass(m.totalReturnPct))}>{fmtPct(m.totalReturnPct, { sign: true })}</td>
            <td className="num text-down">{fmtPct(-m.maxDrawdownPct)}</td>
            <td className="num text-ink-2 hidden sm:table-cell">{m.winRatePct === null ? "–" : fmtPct(m.winRatePct, { digits: 0 })}</td>
            <td className={cn("num", s.score === null ? "text-ink-3" : s.score > 0 ? "text-ink" : "text-down")}>{s.score === null ? "–" : fmtNum(s.score)}</td>
            <td className="num text-ink-2 hidden sm:table-cell">{fmtInt(m.tradeCount)}</td>
            <td className="hidden md:table-cell">
              <Sparkline values={s.result!.equity.map((p) => p.equity)} tone="muted" width={80} height={22} />
            </td>
          </>
        ) : (
          <td colSpan={6} className="text-xs text-down">
            {s.error ?? "Could not run."}
          </td>
        )}
      </tr>
      {isOpen ? (
        <tr id={detailId}>
          <td colSpan={8} className="bg-raised/60 px-4 py-4">
            <CompetitorDetail s={s} competition={competition} series={series} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CompetitorDetail({ s, competition, series }: { s: Standing; competition: Competition; series: CandleSeries[] }) {
  const meta = STRATEGY_LIBRARY[s.participant.config.params.kind];
  const bench = useMemo(() => {
    try {
      return runBacktest(buyAndHoldConfig(s.participant.config), series, { start: competition.rules.start, end: competition.rules.end }).metrics;
    } catch {
      return null;
    }
  }, [s.participant.config, series, competition.rules.start, competition.rules.end]);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">{meta.name}</h3>
        <p className="mt-1 text-sm text-ink-2 leading-5">{meta.explanation}</p>
        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-3">Entry</dt>
            <dd className="text-ink-2">{meta.entryRule}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-3">Exit</dt>
            <dd className="text-ink-2">{meta.exitRule}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-3">Settings</dt>
            <dd className="num text-ink-2">{describeParams(s.participant.config.params) || "none"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-3">Risk</dt>
            <dd className="num text-ink-2">
              stop {s.participant.config.risk.stopLossPct === null ? "off" : fmtPct(s.participant.config.risk.stopLossPct * 100)} · take profit {s.participant.config.risk.takeProfitPct === null ? "off" : fmtPct(s.participant.config.risk.takeProfitPct * 100)}
            </dd>
          </div>
        </dl>
        <h4 className="mt-4 text-xs font-medium text-ink-2">Known weaknesses</h4>
        <ul className="mt-1.5 space-y-1.5">
          {meta.weaknesses.map((w) => (
            <li key={w} className="flex gap-2 text-xs text-ink-2 leading-4">
              <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-warn" />
              {w}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        {s.result && bench ? (
          <MetricsTable
            timeframe={competition.rules.timeframe}
            currency={s.result.currency}
            columns={[
              { name: s.participant.name, metrics: s.result.metrics, color: s.color },
              { name: "Buy & hold", metrics: bench },
            ]}
            compactRows={["totalReturnPct", "cagrPct", "maxDrawdownPct", "sharpe", "tradeCount", "winRatePct", "profitFactor", "exposurePct", "totalFees"]}
          />
        ) : null}
      </div>
    </div>
  );
}
