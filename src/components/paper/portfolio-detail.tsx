"use client";

import { useMemo } from "react";
import { ArrowLeft, Square, Trash2 } from "lucide-react";
import { EquityChart } from "@/components/charts/equity-chart";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { SERIES_COLORS, EXIT_LABEL } from "@/components/lab/results";
import { fmtDate, fmtDateTime, fmtDuration, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass, timeframeLabel } from "@/lib/format";
import { useCandles } from "@/lib/market/client";
import { currencyOf } from "@/lib/market/instruments";
import { advanceClock, computePaperState, stopPortfolio, type PaperPortfolio } from "@/lib/quant/paper";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

export function PortfolioDetail({
  portfolio,
  onBack,
  onChange,
  onDelete,
}: {
  portfolio: PaperPortfolio;
  onBack: () => void;
  onChange: (next: PaperPortfolio) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { series, error, loading } = useCandles(portfolio.config.assets, portfolio.config.timeframe);
  const currency = currencyOf(portfolio.config.assets[0]);
  const latest = useMemo(() => (series ? series[0].candles[series[0].candles.length - 1]?.time ?? null : null), [series]);
  const state = useMemo(() => (series ? computePaperState(portfolio, series) : null), [portfolio, series]);
  const source = series ? series[0].source : null;

  const running = portfolio.status === "running";
  const atLatest = latest !== null && portfolio.clock >= latest;
  const canAdvance = running && !atLatest && latest !== null;

  const advance = (ms: number) => {
    if (latest === null) return;
    void onChange(advanceClock(portfolio, ms, latest));
  };
  const stop = () => {
    if (!window.confirm(`Stop "${portfolio.name}"? Open simulated positions are closed at the current bar and the portfolio becomes read-only.`)) return;
    void onChange(stopPortfolio(portfolio));
  };
  const del = () => {
    if (!window.confirm(`Delete "${portfolio.name}" and its simulated history? This cannot be undone.`)) return;
    void onDelete();
  };

  const meta = STRATEGY_LIBRARY[portfolio.config.params.kind];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> All portfolios
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{portfolio.name}</h2>
            <SimulatedBadge />
            <Badge tone={running ? "annot" : "muted"}>{running ? "Running" : "Stopped"}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {meta.name} · {portfolio.config.assets.map((a) => a.split(":")[1] ?? a).join("+")} · {timeframeLabel(portfolio.config.timeframe)} · started {fmtDate(portfolio.startedAt)} · virtual capital {fmtMoney(portfolio.config.initialCapital)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="danger" size="sm" onClick={stop}>
              <Square className="size-3.5" aria-hidden /> Stop strategy
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={del} aria-label="Delete portfolio">
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}
      {loading && !series ? <Skeleton className="h-64 w-full" /> : null}

      {state ? (
        <>
          <Panel>
            <PanelBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs text-ink-3">Simulated clock</div>
                <div className="num mt-0.5 text-base text-ink">{state.lastBarTime !== null ? fmtDateTime(state.lastBarTime) : fmtDateTime(portfolio.clock)}</div>
                <p className="mt-1 max-w-[52ch] text-2xs text-ink-3 leading-4">
                  In demo mode time only moves when you advance it. With a live data provider the clock is real time.
                  {atLatest ? " You are at the latest available bar." : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => advance(DAY)} disabled={!canAdvance}>
                  Advance 1 day
                </Button>
                <Button size="sm" onClick={() => advance(7 * DAY)} disabled={!canAdvance}>
                  Advance 1 week
                </Button>
                <Button size="sm" variant="primary" onClick={() => latest !== null && advance(latest - portfolio.clock)} disabled={!canAdvance}>
                  Advance to latest
                </Button>
              </div>
            </PanelBody>
          </Panel>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label="Simulated equity" value={fmtMoney(state.equity, { cents: true, currency })} size="md" sub={`Cash ${fmtMoney(state.cash)}`} />
            <Stat label="Total P&L" value={`${state.totalPnl >= 0 ? "+" : ""}${fmtMoney(state.totalPnl, { cents: true, currency })}`} tone={state.totalPnl > 0 ? "up" : state.totalPnl < 0 ? "down" : "neutral"} size="md" sub={fmtPct(state.returnPct, { sign: true })} />
            <Stat label="Realised" value={`${state.realisedPnl >= 0 ? "+" : ""}${fmtMoney(state.realisedPnl, { cents: true, currency })}`} tone={state.realisedPnl > 0 ? "up" : state.realisedPnl < 0 ? "down" : "neutral"} size="md" sub={`${state.closedTrades.length} closed trade${state.closedTrades.length === 1 ? "" : "s"}`} />
            <Stat label="Unrealised" value={`${state.unrealisedPnl >= 0 ? "+" : ""}${fmtMoney(state.unrealisedPnl, { cents: true, currency })}`} tone={state.unrealisedPnl > 0 ? "up" : state.unrealisedPnl < 0 ? "down" : "neutral"} size="md" sub={`${state.positions.length} open position${state.positions.length === 1 ? "" : "s"}`} />
          </div>

          {state.result ? (
            <Panel>
              <PanelHeader title="Simulated equity" description={`${state.barsElapsed} bars since start. Fills at the next bar's open, after fees and slippage.`} />
              <div className="px-2 pt-3 pb-1">
                <EquityChart series={[{ id: "paper", name: portfolio.name, points: state.result.equity, color: SERIES_COLORS[0] }]} height={240} />
              </div>
              <ProvenancePlate
                source={state.result.source}
                period={state.result.period}
                bars={state.result.period.bars}
                timeframe={state.result.timeframe}
                feeBps={state.result.assumptions.feeBps}
                slippageBps={state.result.assumptions.slippageBps}
              />
            </Panel>
          ) : (
            <Panel>
              <PanelBody className="text-sm text-ink-2 leading-5">
                {atLatest ? (
                  <>
                    This portfolio started at the last available bar, so there is no forward data for it to trade yet.
                    {state.result === null && source?.isSynthetic ? " The demo dataset ends here. To paper trade in demo mode, test a period that ends earlier in the Lab (for example a custom end date in mid-2025) and start a new portfolio from there." : " New bars will appear as the data provider publishes them."}
                  </>
                ) : (
                  "The simulation has not consumed a full bar yet. Advance the clock to let the strategy trade."
                )}
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHeader title={`Open positions (${state.positions.length})`} aside={<SimulatedBadge />} />
            {state.positions.length === 0 ? (
              <PanelBody className="text-sm text-ink-3">{running ? "In cash. The strategy has no open position at the current bar." : "No open positions. The portfolio is stopped."}</PanelBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="table min-w-[640px]">
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col" className="num">Quantity</th>
                      <th scope="col" className="num">Entry</th>
                      <th scope="col" className="num">Mark</th>
                      <th scope="col" className="num">Unrealised</th>
                      <th scope="col" className="num">Stop / TP</th>
                      <th scope="col">Entered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.positions.map((p) => (
                      <tr key={p.asset}>
                        <td className="text-ink">{p.asset}</td>
                        <td className="num text-ink-2">{fmtNum(p.quantity, 4)}</td>
                        <td className="num text-ink-2">{fmtPrice(p.entryPrice, currency)}</td>
                        <td className="num text-ink-2">{fmtPrice(p.markPrice, currency)}</td>
                        <td className={cn("num", signClass(p.unrealisedPnl))}>
                          {p.unrealisedPnl >= 0 ? "+" : ""}
                          {fmtMoney(p.unrealisedPnl, { cents: true, currency })} <span className="text-2xs">({fmtPct(p.unrealisedPct, { sign: true })})</span>
                        </td>
                        <td className="num text-ink-3">
                          {p.stopPrice !== null ? fmtPrice(p.stopPrice, currency) : "–"} / {p.takeProfitPrice !== null ? fmtPrice(p.takeProfitPrice, currency) : "–"}
                        </td>
                        <td className="text-xs text-ink-3">
                          <span className="num text-ink-2">{fmtDate(p.entryTime)}</span>
                          <span className="block max-w-[32ch] truncate" title={p.entryReason}>
                            {p.entryReason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader title={`Simulated orders (${state.orders.length})`} description="Most recent first." aside={<SimulatedBadge />} />
              {state.orders.length === 0 ? (
                <PanelBody className="text-sm text-ink-3">No orders yet.</PanelBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table min-w-[520px]">
                    <thead>
                      <tr>
                        <th scope="col">Time</th>
                        <th scope="col">Side</th>
                        <th scope="col">Asset</th>
                        <th scope="col" className="num">Qty</th>
                        <th scope="col" className="num">Price</th>
                        <th scope="col" className="num">Fee</th>
                        <th scope="col">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.orders].reverse().slice(0, 50).map((o, i) => (
                        <tr key={`${o.time}-${o.side}-${i}`}>
                          <td className="num text-ink-2 whitespace-nowrap">{fmtDate(o.time)}</td>
                          <td className={o.side === "buy" ? "text-up" : "text-down"}>{o.side === "buy" ? "Buy" : "Sell"}</td>
                          <td className="text-ink-2">{o.asset}</td>
                          <td className="num text-ink-2">{fmtNum(o.quantity, 4)}</td>
                          <td className="num text-ink-2">{fmtPrice(o.price, currency)}</td>
                          <td className="num text-ink-3">{fmtMoney(o.fee, { cents: true, currency })}</td>
                          <td className="max-w-[28ch] truncate text-xs text-ink-3" title={o.reason}>
                            {o.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel>
              <PanelHeader title={`Closed trades (${state.closedTrades.length})`} description="Most recent first." />
              {state.closedTrades.length === 0 ? (
                <PanelBody className="text-sm text-ink-3">No completed round trips yet.</PanelBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table min-w-[520px]">
                    <thead>
                      <tr>
                        <th scope="col">Asset</th>
                        <th scope="col">Entry</th>
                        <th scope="col">Exit</th>
                        <th scope="col" className="num">Held</th>
                        <th scope="col" className="num">P&amp;L</th>
                        <th scope="col" className="num">Return</th>
                        <th scope="col">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.closedTrades].reverse().slice(0, 50).map((t) => (
                        <tr key={t.id}>
                          <td className="text-ink-2">{t.asset}</td>
                          <td className="num text-ink-2 whitespace-nowrap">{fmtDate(t.entryTime)}</td>
                          <td className="num text-ink-2 whitespace-nowrap">{fmtDate(t.exitTime)}</td>
                          <td className="num text-ink-2">{fmtDuration(t.holdingBars, portfolio.config.timeframe)}</td>
                          <td className={cn("num", signClass(t.pnl))}>
                            {t.pnl >= 0 ? "+" : ""}
                            {fmtMoney(t.pnl, { cents: true, currency })}
                          </td>
                          <td className={cn("num", signClass(t.returnPct))}>{fmtPct(t.returnPct * 100, { sign: true })}</td>
                          <td className="text-xs text-ink-3">{EXIT_LABEL[t.exitReason]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
