"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { EquityChart } from "@/components/charts/equity-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { PageHeader, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { VerdictBadge } from "@/components/ui/verdict";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass } from "@/lib/format";
import { buildLeaderboard, deriveAlerts, marketRows, regimeSummary, type LeaderboardRow } from "@/lib/home/overview";
import { useCandles } from "@/lib/market/client";
import { computePaperState, type PaperState } from "@/lib/quant/paper";
import type { EquityPoint } from "@/lib/quant/types";
import type { Experiment } from "@/lib/store/types";
import { selectExperiments, selectPortfolios, useRepository } from "@/lib/store/use-store";
import { cn } from "@/lib/utils";
import { OnboardingPanel, useOnboarding } from "./onboarding";

export function CommandCentre() {
  const { series, error, loading } = useCandles(["BTC", "ETH"], "4h");
  const experiments = useRepository(selectExperiments);
  const portfolios = useRepository(selectPortfolios);
  const onboarding = useOnboarding();

  const market = useMemo(() => (series ? marketRows(series) : null), [series]);
  const regime = useMemo(() => (series ? regimeSummary(series[0]) : null), [series]);

  const paper = useMemo<PaperState[]>(() => {
    if (!series || !portfolios.items) return [];
    return portfolios.items
      .map((p) => {
        try {
          const needed = series.filter((s) => p.config.assets.includes(s.asset));
          // Portfolios on other timeframes still need their own series; only 4h ones can be computed here cheaply.
          if (p.config.timeframe !== "4h") return null;
          return computePaperState(p, needed);
        } catch {
          return null;
        }
      })
      .filter((s): s is PaperState => s !== null);
  }, [series, portfolios.items]);
  const otherTfCount = (portfolios.items ?? []).filter((p) => p.config.timeframe !== "4h").length;

  const board = useMemo(() => (series && experiments.items ? buildLeaderboard(experiments.items, series) : null), [series, experiments.items]);
  const alerts = useMemo(() => (board && experiments.items ? deriveAlerts({ rows: board.rows, experiments: experiments.items, paper }) : []), [board, experiments.items, paper]);

  const recent = useMemo(() => [...(experiments.items ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [experiments.items]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Command Centre"
        description={regime ? <span>{regime.sentence}</span> : "What the market is doing, how your strategies are holding up, and what to look at next."}
        actions={
          <>
            {onboarding.dismissed ? (
              <button type="button" onClick={onboarding.show} className="text-xs text-ink-3 hover:text-ink">
                Show guide
              </button>
            ) : null}
            <Button variant="primary" className="hidden lg:inline-flex" asChild>
              <Link href="/lab/build">
                <Plus className="size-4" aria-hidden /> New experiment
              </Link>
            </Button>
          </>
        }
      />

      {onboarding.dismissed === false ? <OnboardingPanel onDismiss={onboarding.dismiss} /> : null}

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}

      <MarketStrip market={market} regime={regime} loading={loading} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <PaperHeadline paper={paper} loading={loading || portfolios.loading} otherTfCount={otherTfCount} />
        <Leaderboard board={board} loading={loading || experiments.loading} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:items-start">
        <Positions paper={paper} />
        <RecentExperiments recent={recent} loading={experiments.loading} />
      </div>

      <Alerts alerts={alerts} />

      {/* Mobile primary action, above the tab bar. */}
      <Button variant="primary" size="lg" className="fixed right-4 z-20 shadow-[0_8px_24px_rgba(0,0,0,0.45)] lg:hidden" style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }} asChild>
        <Link href="/lab/build">
          <Plus className="size-4" aria-hidden /> New experiment
        </Link>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function MarketStrip({ market, regime, loading }: { market: ReturnType<typeof marketRows> | null; regime: ReturnType<typeof regimeSummary>; loading: boolean }) {
  return (
    <Panel>
      <div className="grid divide-y divide-hairline sm:grid-cols-[1fr_1fr_minmax(0,1.3fr)] sm:divide-x sm:divide-y-0">
        {(market ?? [null, null]).map((row, i) => (
          <div key={row?.asset ?? i} className="flex items-center justify-between gap-3 px-4 py-3">
            {row ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">{row.asset}</span>
                  <span className="num text-sm text-ink">{fmtPrice(row.last)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className={cn("num block text-xs", signClass(row.change24hPct))}>{fmtPct(row.change24hPct, { sign: true })}</span>
                    <span className="block text-2xs text-ink-3">24h</span>
                  </div>
                  <div className="text-right">
                    <span className={cn("num block text-xs", signClass(row.change7dPct))}>{fmtPct(row.change7dPct, { sign: true })}</span>
                    <span className="block text-2xs text-ink-3">7d</span>
                  </div>
                  <Sparkline values={row.closes} width={64} height={22} tone="muted" />
                </div>
              </>
            ) : (
              <Skeleton className="h-5 w-full" />
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-3">
          {regime ? (
            <>
              <Badge tone={regime.regime === "uptrend" ? "up" : regime.regime === "downtrend" ? "down" : regime.regime === "high_volatility" ? "warn" : "neutral"}>{regime.label}</Badge>
              <span className="text-xs text-ink-2">
                BTC regime, <span className="num">{regime.barsPersisted}</span> bars so far
              </span>
            </>
          ) : loading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <span className="text-xs text-ink-3">Regime unavailable</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function combinedEquity(paper: PaperState[]): EquityPoint[] {
  const withResults = paper.filter((p) => p.result);
  if (withResults.length === 0) return [];
  if (withResults.length === 1) return withResults[0].result!.equity;
  // Sum equity across portfolios at each timestamp present in all of them.
  const maps = withResults.map((p) => new Map(p.result!.equity.map((e) => [e.time, e.equity])));
  const times = [...maps[0].keys()].filter((t) => maps.every((m) => m.has(t)));
  let peak = -Infinity;
  return times.map((time) => {
    const equity = maps.reduce((s, m) => s + (m.get(time) ?? 0), 0);
    if (equity > peak) peak = equity;
    return { time, equity, cash: 0, exposure: 0, drawdown: peak > 0 ? (peak - equity) / peak : 0 };
  });
}

function PaperHeadline({ paper, loading, otherTfCount }: { paper: PaperState[]; loading: boolean; otherTfCount: number }) {
  const running = paper.filter((p) => p.portfolio.status === "running");
  const total = paper.reduce((s, p) => s + p.equity, 0);
  const capital = paper.reduce((s, p) => s + p.portfolio.config.initialCapital, 0);
  const pnl = total - capital;
  const equity = useMemo(() => combinedEquity(paper), [paper]);
  const currentDd = equity.length ? equity[equity.length - 1].drawdown * 100 : 0;

  return (
    <Panel>
      <PanelHeader title="Simulated portfolio" description={paper.length ? `${running.length} running · ${paper.length - running.length} stopped` : "Paper trading with virtual capital"} aside={<SimulatedBadge />} />
      {loading && paper.length === 0 ? (
        <PanelBody>
          <Skeleton className="h-10 w-40" />
          <Skeleton className="mt-3 h-24 w-full" />
        </PanelBody>
      ) : paper.length === 0 ? (
        <PanelBody>
          <p className="max-w-[44ch] text-sm text-ink-2 leading-5">No simulated portfolios yet. Test a strategy in the Lab, then follow it forward with virtual capital to see whether the backtest survives contact with bars it never saw.</p>
          <Button className="mt-4" variant="primary" asChild>
            <Link href="/lab/build">Start in the Lab</Link>
          </Button>
          {otherTfCount > 0 ? <p className="mt-3 text-2xs text-ink-3">{otherTfCount} portfolio(s) on other timeframes are shown on the Paper Trading page.</p> : null}
        </PanelBody>
      ) : (
        <>
          <PanelBody className="flex flex-wrap items-end justify-between gap-4">
            <Stat label="Total value" value={fmtMoney(total)} size="lg" />
            <Stat
              label="Profit / loss"
              value={`${pnl >= 0 ? "+" : ""}${fmtMoney(pnl)}`}
              tone={pnl >= 0 ? "up" : "down"}
              sub={
                <span>
                  <span className={signClass(pnl)}>{fmtPct(capital > 0 ? (pnl / capital) * 100 : 0, { sign: true })}</span> on {fmtMoney(capital)}
                  {currentDd > 0.5 ? <span className="text-down"> · {fmtPct(currentDd)} below peak</span> : null}
                </span>
              }
            />
          </PanelBody>
          {equity.length >= 2 ? (
            <div className="px-2 pb-1">
              <EquityChart series={[{ id: "paper", name: "Simulated equity", points: equity, color: "var(--series-1)" }]} height={150} />
            </div>
          ) : (
            <p className="px-4 pb-3 text-xs text-ink-3">The clock has not advanced yet. Open Paper Trading to step the simulation forward.</p>
          )}
          {paper[0]?.result ? <ProvenancePlate source={paper[0].result.source} timeframe="4h" extra={otherTfCount > 0 ? <span className="text-ink-3">+{otherTfCount} on other timeframes</span> : undefined} /> : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function Leaderboard({ board, loading }: { board: ReturnType<typeof buildLeaderboard> | null; loading: boolean }) {
  const strongest = board?.rows.find((r) => r.score !== null) ?? null;
  const deteriorating = board?.rows.find((r) => r.deteriorating) ?? null;
  return (
    <Panel>
      <PanelHeader
        title="Strategy leaderboard"
        description={board ? (board.source === "journal" ? "Your saved experiments, re-run on the last two years of 4h bars." : "Library defaults. Save your own experiments to see them here.") : "Ranked by risk-adjusted return."}
      />
      {board && board.rows.length ? (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 pt-3 pb-1 text-xs">
            {strongest ? (
              <p className="text-ink-2">
                Strongest: <Link href={strongest.href} className="text-ink underline-offset-2 hover:underline">{strongest.name}</Link>, Sharpe <span className="num">{fmtNum(strongest.score)}</span>.
              </p>
            ) : null}
            {deteriorating ? (
              <p className="text-warn">
                Deteriorating: <Link href={deteriorating.href} className="underline-offset-2 hover:underline">{deteriorating.name}</Link>, {describeDeterioration(deteriorating)}.
              </p>
            ) : (
              <p className="text-ink-3">Nothing is rolling over right now.</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="num w-8">#</th>
                  <th scope="col">Strategy</th>
                  <th scope="col" className="num">Return</th>
                  <th scope="col" className="num">Max DD</th>
                  <th scope="col" className="num" title="Sharpe ratio: return per unit of risk. Return divided by drawdown when Sharpe cannot be estimated.">Risk-adj.</th>
                  <th scope="col" className="num hidden sm:table-cell">Trades</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="num text-ink-3">{i + 1}</td>
                    <td>
                      <Link href={r.href} className="text-ink underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                      {r.deteriorating ? <Badge tone="warn" className="ml-2">Deteriorating</Badge> : null}
                      {i === 0 && r.score !== null ? <Badge tone="up" className="ml-2">Strongest</Badge> : null}
                    </td>
                    <td className={cn("num", signClass(r.result.metrics.totalReturnPct))}>{fmtPct(r.result.metrics.totalReturnPct, { sign: true })}</td>
                    <td className="num text-down">{fmtPct(-r.result.metrics.maxDrawdownPct)}</td>
                    <td className="num text-ink-2">{r.score === null ? "–" : fmtNum(r.score)}</td>
                    <td className={cn("num hidden sm:table-cell", r.result.metrics.tradeCount < 30 ? "text-warn" : "text-ink-2")}>{fmtInt(r.result.metrics.tradeCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ProvenancePlate source={board.rows[0].result.source} period={board.period} timeframe="4h" feeBps={board.rows[0].config.costs.feeBps} slippageBps={board.rows[0].config.costs.slippageBps} />
        </>
      ) : loading ? (
        <PanelBody>
          <Skeleton className="h-40 w-full" />
        </PanelBody>
      ) : (
        <PanelBody>
          <p className="text-sm text-ink-2">No strategies could be ranked.</p>
        </PanelBody>
      )}
    </Panel>
  );
}

function describeDeterioration(r: LeaderboardRow): string {
  if (r.recent60dPct !== null && r.prior60dPct !== null && r.recent60dPct < 0 && r.prior60dPct > 0) {
    return `${fmtPct(r.recent60dPct, { sign: true })} over the last 60 days after ${fmtPct(r.prior60dPct, { sign: true })} before`;
  }
  return `${fmtPct(r.currentDrawdownPct, { digits: 0 })} below its peak`;
}

/* ------------------------------------------------------------------------- */

function Positions({ paper }: { paper: PaperState[] }) {
  const positions = paper.flatMap((p) => p.positions.map((pos) => ({ ...pos, portfolio: p.portfolio })));
  return (
    <Panel>
      <PanelHeader title="Open positions" description="Across running simulated portfolios." aside={<SimulatedBadge />} />
      {positions.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2">{paper.length ? "All simulated portfolios are in cash." : "No positions. Nothing is paper trading yet."}</p>
        </PanelBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Portfolio</th>
                <th scope="col">Asset</th>
                <th scope="col" className="num hidden sm:table-cell">Entry</th>
                <th scope="col" className="num hidden sm:table-cell">Mark</th>
                <th scope="col" className="num">Unrealised</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={`${p.portfolio.id}-${p.asset}`}>
                  <td>
                    <Link href={`/paper?id=${p.portfolio.id}`} className="text-ink underline-offset-2 hover:underline">
                      {p.portfolio.name}
                    </Link>
                  </td>
                  <td className="text-ink-2">{p.asset}</td>
                  <td className="num text-ink-2 hidden sm:table-cell">{fmtPrice(p.entryPrice)}</td>
                  <td className="num text-ink-2 hidden sm:table-cell">{fmtPrice(p.markPrice)}</td>
                  <td className={cn("num whitespace-nowrap", signClass(p.unrealisedPnl))}>
                    {fmtMoney(p.unrealisedPnl, { cents: Math.abs(p.unrealisedPnl) < 100 })} <span className="text-ink-3">({fmtPct(p.unrealisedPct, { sign: true })})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function RecentExperiments({ recent, loading }: { recent: Experiment[]; loading: boolean }) {
  return (
    <Panel>
      <PanelHeader
        title="Recent experiments"
        aside={
          <Link href="/journal" className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
            Journal <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {loading ? (
        <PanelBody>
          <Skeleton className="h-24 w-full" />
        </PanelBody>
      ) : recent.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2">Nothing saved yet. When you save a backtest, its hypothesis, parameters, dataset and result are recorded here.</p>
        </PanelBody>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((e) => (
            <li key={e.id}>
              <Link href={`/journal/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm text-ink">{e.name}</span>
                    <span className="num text-2xs text-ink-3">v{e.version}</span>
                  </div>
                  <div className="num mt-0.5 text-2xs text-ink-3">{fmtDate(e.createdAt)}</div>
                </div>
                <span className={cn("num text-xs", signClass(e.result.metrics.totalReturnPct))}>{fmtPct(e.result.metrics.totalReturnPct, { sign: true })}</span>
                {e.result.verdict ? <VerdictBadge verdict={e.result.verdict} size="sm" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function Alerts({ alerts }: { alerts: ReturnType<typeof deriveAlerts> }) {
  if (alerts.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="What to look at next" description="Derived from your results. Nothing here is a recommendation to trade." />
      <ul className="divide-y divide-hairline">
        {alerts.map((a) => (
          <li key={a.id}>
            {a.href ? (
              <Link href={a.href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-hover">
                <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", a.tone === "down" ? "bg-down" : a.tone === "warn" ? "bg-warn" : "bg-annot")} aria-hidden />
                <span className="text-sm text-ink-2 leading-5">{a.text}</span>
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", a.tone === "down" ? "bg-down" : a.tone === "warn" ? "bg-warn" : "bg-annot")} aria-hidden />
                <span className="text-sm text-ink-2 leading-5">{a.text}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
