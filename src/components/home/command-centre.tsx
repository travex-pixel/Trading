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
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass, type Currency } from "@/lib/format";
import { buildLeaderboard, deriveAlerts, HOME_TIMEFRAME, HOME_WATCHLIST, marketRows, regimeSummary, type LeaderboardRow } from "@/lib/home/overview";
import { useMonitor, type LiveSignal } from "@/lib/home/signals";
import { marketStatus, tzLabel } from "@/lib/market/calendar";
import { MARKETS } from "@/lib/market/instruments";
import { useCandles } from "@/lib/market/client";
import type { PaperState } from "@/lib/quant/paper";
import type { EquityPoint } from "@/lib/quant/types";
import type { Experiment } from "@/lib/store/types";
import { selectExperiments, selectPortfolios, useRepository } from "@/lib/store/use-store";
import { cn } from "@/lib/utils";
import { DailyTeaser } from "@/components/daily/daily-quiz";
import { OnboardingPanel, useOnboarding } from "./onboarding";
import { useNow } from "./use-now";

export function CommandCentre() {
  const { series, error, loading } = useCandles([...HOME_WATCHLIST], HOME_TIMEFRAME);
  const experiments = useRepository(selectExperiments);
  const portfolios = useRepository(selectPortfolios);
  const onboarding = useOnboarding();
  const monitor = useMonitor(experiments.items, portfolios.items);

  const market = useMemo(() => (series ? marketRows(series) : null), [series]);
  const regime = useMemo(() => (series ? regimeSummary(series[0]) : null), [series]);
  const board = useMemo(() => (experiments.items ? buildLeaderboard(experiments.items, series ? series.filter((s) => s.asset === "ASX:CBA" || s.asset === "ASX:BHP") : null) : null), [series, experiments.items]);
  const alerts = useMemo(() => (board && experiments.items ? deriveAlerts({ rows: board.rows, experiments: experiments.items, paper: monitor.paper }) : []), [board, experiments.items, monitor.paper]);
  const recent = useMemo(() => [...(experiments.items ?? [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [experiments.items]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Command Centre"
        description={regime ? <span>{regime.sentence}</span> : "What the ASX is doing, how your strategies are holding up, which signals need attention, and what to look at next."}
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

      <DailyTeaser />
      {onboarding.dismissed === false ? <OnboardingPanel onDismiss={onboarding.dismiss} /> : null}

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}

      <MarketStrip market={market} regime={regime} loading={loading} source={series?.[0]?.source ?? null} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <PaperHeadline paper={monitor.paper} loading={monitor.loading || portfolios.loading} />
        <Leaderboard board={board} loading={loading || experiments.loading} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:items-start">
        <Signals signals={monitor.signals} loading={monitor.loading} hasStrategies={(experiments.items?.length ?? 0) > 0} />
        <Positions paper={monitor.paper} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:items-start">
        <RecentExperiments recent={recent} loading={experiments.loading} />
        <Alerts alerts={alerts} />
      </div>

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

function MarketStrip({ market, regime, loading, source }: { market: ReturnType<typeof marketRows> | null; regime: ReturnType<typeof regimeSummary>; loading: boolean; source: import("@/lib/quant/types").DataSource | null }) {
  const now = useNow();
  const status = now ? marketStatus("ASX", now) : null;
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-ink">ASX</span>
          <span className="text-ink-3">{MARKETS.ASX.description.split(".")[0]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {status ? (
            <>
              <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-medium", status.state === "open" ? "text-up" : "text-ink-2")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", status.state === "open" ? "bg-up" : "bg-ink-3")} />
                {status.state === "open" ? "Open" : status.state === "closed" ? `Closed · ${status.reason === "weekend" ? "weekend" : status.reason === "holiday" ? "holiday" : status.reason === "pre_market" ? "pre-market" : "after hours"}` : "Open 24/7"}
              </span>
              <span className="num text-ink-3">
                {status.state === "open" ? `closes ${new Date(status.closesAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })}` : status.state === "closed" && status.opensAt ? `opens ${new Date(status.opensAt).toLocaleString("en-AU", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })}` : ""} {now ? tzLabel("ASX", now) : ""}
              </span>
            </>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
        {(market ?? [null, null, null, null]).map((row, i) => (
          <Link key={row?.asset ?? i} href={row ? `/lab/build?asset=${encodeURIComponent(row.asset)}` : "/markets"} className="group flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-hover">
            {row ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="num text-sm font-semibold text-ink">{row.symbol}</span>
                  <span className="num text-sm text-ink">{fmtPrice(row.last, row.currency)}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex gap-3">
                    <div>
                      <span className={cn("num block text-xs", signClass(row.change1dPct))}>{fmtPct(row.change1dPct, { sign: true })}</span>
                      <span className="block text-2xs text-ink-3">1d</span>
                    </div>
                    <div>
                      <span className={cn("num block text-xs", signClass(row.change1mPct))}>{fmtPct(row.change1mPct, { sign: true })}</span>
                      <span className="block text-2xs text-ink-3">1m</span>
                    </div>
                  </div>
                  <Sparkline values={row.closes} width={64} height={22} tone="muted" />
                </div>
              </>
            ) : (
              <Skeleton className="h-12 w-full" />
            )}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2">
        <div className="flex items-center gap-2">
          {regime ? (
            <>
              <Badge tone={regime.regime === "uptrend" ? "up" : regime.regime === "downtrend" ? "down" : regime.regime === "high_volatility" ? "warn" : "neutral"}>{regime.label}</Badge>
              <span className="text-xs text-ink-2">
                {regime.symbol} regime, <span className="num">{regime.barsPersisted}</span> sessions so far
              </span>
            </>
          ) : loading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <span className="text-xs text-ink-3">Regime unavailable</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-2xs">
          {source ? (
            <span className={cn("font-mono", source.isSynthetic ? "text-warn" : "text-ink-3")}>
              {source.isSynthetic ? "DEMO · synthetic · last bar " : `${source.label} · last close `}
              {market?.[0] ? fmtDate(market[0].lastTime) : ""}
            </span>
          ) : null}
          <Link href="/markets" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-ink-2 hover:text-ink">
            All markets <ArrowRight className="size-3" aria-hidden />
          </Link>
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
  const maps = withResults.map((p) => new Map(p.result!.equity.map((e) => [e.time, e.equity])));
  const times = [...maps[0].keys()].filter((t) => maps.every((m) => m.has(t)));
  let peak = -Infinity;
  return times.map((time) => {
    const equity = maps.reduce((s, m) => s + (m.get(time) ?? 0), 0);
    if (equity > peak) peak = equity;
    return { time, equity, cash: 0, exposure: 0, drawdown: peak > 0 ? (peak - equity) / peak : 0 };
  });
}

function PaperHeadline({ paper, loading }: { paper: PaperState[]; loading: boolean }) {
  // Totals are per currency; the headline shows the largest group and lists the rest.
  const groups = useMemo(() => {
    const by = new Map<Currency, PaperState[]>();
    for (const p of paper) {
      const ccy = (p.result?.currency ?? "AUD") as Currency;
      by.set(ccy, [...(by.get(ccy) ?? []), p]);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [paper]);
  const [headCcy, head] = groups[0] ?? ["AUD" as Currency, [] as PaperState[]];
  const running = paper.filter((p) => p.portfolio.status === "running");
  const total = head.reduce((s, p) => s + p.equity, 0);
  const capital = head.reduce((s, p) => s + p.portfolio.config.initialCapital, 0);
  const pnl = total - capital;
  const equity = useMemo(() => combinedEquity(head), [head]);
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
          <p className="max-w-[44ch] text-sm text-ink-2 leading-5">No simulated portfolios yet. Test a strategy in the Lab, then follow it forward with virtual capital to see whether the backtest survives contact with data it has not seen.</p>
          <Button className="mt-4" variant="primary" asChild>
            <Link href="/lab/build">Start in the Lab</Link>
          </Button>
        </PanelBody>
      ) : (
        <>
          <PanelBody className="flex flex-wrap items-end justify-between gap-4">
            <Stat label={`Total value (${headCcy})`} value={fmtMoney(total, { currency: headCcy })} size="lg" />
            <Stat
              label="Profit / loss"
              value={fmtMoney(pnl, { currency: headCcy, sign: true })}
              tone={pnl >= 0 ? "up" : "down"}
              sub={
                <span>
                  <span className={signClass(pnl)}>{fmtPct(capital > 0 ? (pnl / capital) * 100 : 0, { sign: true })}</span> on {fmtMoney(capital, { currency: headCcy })}
                  {currentDd > 0.5 ? <span className="text-down"> · {fmtPct(currentDd)} below peak</span> : null}
                </span>
              }
            />
          </PanelBody>
          {groups.length > 1 ? (
            <p className="px-4 pb-2 text-2xs text-ink-3">
              Also {groups.slice(1).map(([ccy, ps]) => `${fmtMoney(ps.reduce((s, p) => s + p.equity, 0), { currency: ccy })} across ${ps.length} ${ccy} portfolio${ps.length === 1 ? "" : "s"}`).join("; ")}.
            </p>
          ) : null}
          {equity.length >= 2 ? (
            <div className="px-2 pb-1">
              <EquityChart series={[{ id: "paper", name: "Simulated equity", points: equity, color: "var(--series-1)" }]} height={150} currency={headCcy} />
            </div>
          ) : (
            <p className="px-4 pb-3 text-xs text-ink-3">The clock has not advanced yet. Open Portfolio to step the simulation forward.</p>
          )}
          {head[0]?.result ? <ProvenancePlate source={head[0].result.source} timeframe={head[0].result.timeframe} currency={headCcy} /> : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function Leaderboard({ board, loading }: { board: ReturnType<typeof buildLeaderboard> | null; loading: boolean }) {
  const rows = board?.rows ?? [];
  const strongest = rows[0];
  const deteriorating = rows.find((r) => r.deteriorating);
  return (
    <Panel>
      <PanelHeader
        title="Strategy leaderboard"
        description={board?.source === "journal" ? "Your saved experiments, as tested. Ranked by risk-adjusted return." : "Library defaults on CBA (ASX), daily bars, last two years. Save your own experiments to see them here."}
        aside={
          <Button size="sm" variant="ghost" asChild>
            <Link href="/lab">Strategies</Link>
          </Button>
        }
      />
      {loading && rows.length === 0 ? (
        <PanelBody>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </PanelBody>
      ) : rows.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2">Nothing to rank yet.</p>
        </PanelBody>
      ) : (
        <>
          <div className="space-y-1 px-4 pt-3 text-xs text-ink-2">
            {strongest ? (
              <p>
                Strongest: <Link href={strongest.href} className="text-ink hover:underline underline-offset-2">{strongest.name}</Link>
                {strongest.metrics.sharpe !== null ? <>, Sharpe <span className="num">{fmtNum(strongest.metrics.sharpe)}</span></> : null}.
              </p>
            ) : null}
            {deteriorating ? (
              <p className="text-warn">
                Deteriorating: <Link href={deteriorating.href} className="hover:underline underline-offset-2">{deteriorating.name}</Link>
                {deteriorating.recent60dPct !== null ? <>, {fmtPct(deteriorating.recent60dPct, { sign: true })} over its last 60 days</> : <>, {fmtPct(deteriorating.currentDrawdownPct, { digits: 0 })} below its peak</>}.
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Strategy</th>
                  <th scope="col" className="num">Return</th>
                  <th scope="col" className="num hidden sm:table-cell">Max DD</th>
                  <th scope="col" className="num">Risk-adj.</th>
                  <th scope="col" className="num hidden sm:table-cell">Trades</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <LeaderboardRowView key={r.id} row={r} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>
          {board?.source === "library" && board.period ? <p className="px-4 pb-3 pt-1 text-2xs text-ink-3">Demo dataset · {fmtDate(board.period.start)} – {fmtDate(board.period.end)} · daily bars.</p> : null}
        </>
      )}
    </Panel>
  );
}

function LeaderboardRowView({ row, rank }: { row: LeaderboardRow; rank: number }) {
  return (
    <tr>
      <td className="num text-ink-3">{rank}</td>
      <td>
        <Link href={row.href} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink hover:underline underline-offset-2">
          <span className="truncate">{row.name}</span>
          <span className="num text-2xs text-ink-3">{row.instrumentLabel}</span>
          {row.deteriorating ? <Badge tone="warn">Deteriorating</Badge> : null}
          {rank === 1 ? <Badge tone="up">Strongest</Badge> : null}
          {row.verdict ? <VerdictBadge verdict={row.verdict} size="sm" /> : null}
        </Link>
      </td>
      <td className={cn("num", signClass(row.metrics.totalReturnPct))}>
        {fmtPct(row.metrics.totalReturnPct, { sign: true })}
        {row.benchmarkReturnPct !== null ? <span className="block text-2xs text-ink-3">B&amp;H {fmtPct(row.benchmarkReturnPct, { sign: true })}</span> : null}
      </td>
      <td className="num hidden text-down sm:table-cell">{fmtPct(-row.metrics.maxDrawdownPct)}</td>
      <td className="num text-ink-2">{row.score === null ? "–" : fmtNum(row.score)}</td>
      <td className="num hidden text-ink-2 sm:table-cell">{fmtInt(row.metrics.tradeCount)}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------------- */

function Signals({ signals, loading, hasStrategies }: { signals: LiveSignal[]; loading: boolean; hasStrategies: boolean }) {
  return (
    <Panel>
      <PanelHeader title="Signals" description="Your saved strategies, re-run on the latest bars. A row appears when a rule fired within the last three bars." />
      {loading && hasStrategies ? (
        <PanelBody>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </PanelBody>
      ) : !hasStrategies ? (
        <PanelBody>
          <p className="text-sm text-ink-2 leading-5">Save a strategy to the journal and it will be monitored here against incoming data.</p>
        </PanelBody>
      ) : signals.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2 leading-5">No strategy fired on its latest bars. Quiet is a valid state.</p>
        </PanelBody>
      ) : (
        <ul className="divide-y divide-hairline">
          {signals.slice(0, 5).map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={s.href} className="flex min-w-0 items-center gap-2 text-sm text-ink hover:underline underline-offset-2">
                  <Badge tone={s.side === "buy" ? "up" : "down"}>{s.side === "buy" ? "Buy" : "Sell"}</Badge>
                  <span className="num font-semibold">{s.instrument}</span>
                  <span className="truncate text-ink-2">{s.name}</span>
                </Link>
                <span className="num text-2xs text-ink-3">
                  {s.barsAgo === 0 ? "latest bar" : `${s.barsAgo} bar${s.barsAgo === 1 ? "" : "s"} ago`} · {fmtDateTime(s.time)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-2 leading-4">{s.reason}</p>
              <p className="num mt-1 text-2xs text-ink-3">
                at {fmtPrice(s.price, s.currency as Currency)} · size {s.sizeFraction !== null ? `${Math.round(s.sizeFraction * 100)}% of equity` : "volatility-targeted"}
                {s.stopLossPct !== null ? ` · stop ${(s.stopLossPct * 100).toFixed(1)}%` : ""}
                {s.takeProfitPct !== null ? ` · take profit ${(s.takeProfitPct * 100).toFixed(1)}%` : ""}
                {s.isSynthetic ? " · demo data" : s.marketOpen ? " · market open" : " · market closed"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */

function Positions({ paper }: { paper: PaperState[] }) {
  const open = paper.flatMap((p) => (p.portfolio.status === "running" ? p.positions.map((pos) => ({ pos, portfolio: p.portfolio, currency: (p.result?.currency ?? "AUD") as Currency })) : []));
  return (
    <Panel>
      <PanelHeader title="Open positions" description="Across running simulated portfolios." aside={<SimulatedBadge />} />
      {open.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2">No open simulated positions.</p>
        </PanelBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Portfolio</th>
                <th scope="col">Instrument</th>
                <th scope="col" className="num hidden sm:table-cell">Entry</th>
                <th scope="col" className="num hidden sm:table-cell">Mark</th>
                <th scope="col" className="num">Unrealised</th>
              </tr>
            </thead>
            <tbody>
              {open.map(({ pos, portfolio, currency }) => (
                <tr key={`${portfolio.id}-${pos.asset}`}>
                  <td>
                    <Link href={`/paper?id=${portfolio.id}`} className="text-ink hover:underline underline-offset-2">
                      {portfolio.name}
                    </Link>
                  </td>
                  <td className="num text-ink-2">{pos.asset.split(":")[1] ?? pos.asset}</td>
                  <td className="num hidden text-ink-2 sm:table-cell">{fmtPrice(pos.entryPrice, currency)}</td>
                  <td className="num hidden text-ink-2 sm:table-cell">{fmtPrice(pos.markPrice, currency)}</td>
                  <td className={cn("num", signClass(pos.unrealisedPnl))}>
                    {fmtMoney(pos.unrealisedPnl, { cents: Math.abs(pos.unrealisedPnl) < 100, currency, sign: true })} <span className="text-ink-3">({fmtPct(pos.unrealisedPct, { sign: true })})</span>
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
          <Link href="/journal" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
            Journal <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {loading ? (
        <PanelBody>
          <Skeleton className="h-4 w-2/3" />
        </PanelBody>
      ) : recent.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2 leading-5">No experiments yet. The journal records every test so you stop re-running the same idea.</p>
        </PanelBody>
      ) : (
        <ul className="divide-y divide-hairline">
          {recent.map((e) => (
            <li key={e.id}>
              <Link href={`/journal/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-hover">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-ink">{e.name}</span>
                    <span className="num text-2xs text-ink-3">v{e.version}</span>
                    <span className="num text-2xs text-ink-3">{e.assets.map((a) => a.split(":")[1] ?? a).join("+")}</span>
                  </div>
                  <div className="num text-2xs text-ink-3">{fmtDate(e.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={cn("num text-xs", signClass(e.result.metrics.totalReturnPct))}>{fmtPct(e.result.metrics.totalReturnPct, { sign: true })}</span>
                  {e.result.verdict ? <VerdictBadge verdict={e.result.verdict} size="sm" /> : null}
                </div>
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
  return (
    <Panel>
      <PanelHeader title="What to look at next" description="Derived from your results. Nothing here is a recommendation to trade." />
      {alerts.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-2">Nothing needs attention.</p>
        </PanelBody>
      ) : (
        <ul className="divide-y divide-hairline">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", a.tone === "down" ? "bg-down" : a.tone === "warn" ? "bg-warn" : "bg-annot")} aria-hidden />
              {a.href ? (
                <Link href={a.href} className="text-sm text-ink-2 leading-5 hover:text-ink">
                  {a.text}
                </Link>
              ) : (
                <span className="text-sm text-ink-2 leading-5">{a.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
