"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronFirst, ChevronLast, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { EquityChart } from "@/components/charts/equity-chart";
import type { PriceLineSpec, PriceMarker } from "@/components/charts/price-chart";
import { InstrumentPicker } from "@/components/market/instrument-picker";
import { MARKETS, defaultInstrument, marketOf, rotationPair } from "@/lib/market/instruments";
import { PeriodPicker, presetPeriod } from "@/components/lab/period-picker";
import { Badge, SimulatedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/empty";
import { Field, Segmented, Select } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { fmtDateTime, fmtMoney, fmtNum, fmtPct, fmtPrice, signClass, type Currency } from "@/lib/format";
import { useCandles } from "@/lib/market/client";
import { runBacktest, windowCandles } from "@/lib/quant/backtest";
import type { AssetId, BacktestResult, Candle, Timeframe } from "@/lib/quant/types";
import type { Period } from "@/lib/quant/validation";
import { buildEvents, frameAt, nextEventIndex, prevEventIndex, type ReplayEvent } from "@/lib/replay/state";
import { decodeSnapshot } from "@/lib/store/snapshot";
import { prepareStrategy, STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { IndicatorDisplay } from "@/lib/strategies/runtime";
import type { StrategyConfig, StrategyKind } from "@/lib/strategies/schema";
import { cn } from "@/lib/utils";

const PriceChart = dynamic(() => import("@/components/charts/price-chart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full lg:h-[380px]" />,
});

const SPEEDS = [1, 4, 16, 64] as const;
type Speed = (typeof SPEEDS)[number];

const DEFAULT_KIND: StrategyKind = "ma_crossover";

export function Replay() {
  const params = useSearchParams();
  const initial = useMemo<{ config: StrategyConfig; period: Period | null; fromLab: boolean }>(() => {
    const s = params.get("s");
    if (s) {
      const d = decodeSnapshot(s);
      if (d.ok) return { config: d.snapshot.config, period: { start: d.snapshot.start, end: d.snapshot.end }, fromLab: true };
    }
    return { config: STRATEGY_LIBRARY[DEFAULT_KIND].defaults, period: null, fromLab: false };
  }, [params]);

  const [config, setConfig] = useState<StrategyConfig>(initial.config);
  const [period, setPeriod] = useState<Period | null>(initial.period);
  const { series, error, loading } = useCandles(config.assets, config.timeframe);

  const dataRange = useMemo(() => {
    if (!series || series[0].candles.length === 0) return null;
    return { start: series[0].candles[0].time, end: series[0].candles[series[0].candles.length - 1].time };
  }, [series]);

  const effectivePeriod = useMemo<Period | null>(() => {
    if (!dataRange) return null;
    if (!period) return presetPeriod("6m", dataRange.start, dataRange.end);
    return { start: Math.max(dataRange.start, period.start), end: Math.min(dataRange.end, period.end) };
  }, [dataRange, period]);

  const prepared = useMemo<{ result: BacktestResult; candles: Candle[]; display: IndicatorDisplay[]; events: ReplayEvent[] } | { error: string } | null>(() => {
    if (!series || !effectivePeriod) return null;
    try {
      const result = runBacktest(config, series, effectivePeriod);
      const primary = series.find((s) => s.asset === config.assets[0]) ?? series[0];
      const candles = windowCandles(primary, result);
      const aligned = Object.fromEntries(series.map((s) => [s.asset, s.candles])) as Record<AssetId, Candle[]>;
      const display = prepareStrategy(config, aligned).display.filter((d) => d.key.startsWith(`${primary.asset}:`));
      return { result, candles, display, events: buildEvents(result) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "The replay could not be prepared." };
    }
  }, [series, effectivePeriod, config]);

  const market = marketOf(config.assets[0]);
  const setKind = (kind: StrategyKind) => {
    const defaults = STRATEGY_LIBRARY[kind].defaults;
    const assets: AssetId[] = kind === "momentum_rotation" ? [...rotationPair(market)] : [config.assets[0] ?? defaultInstrument(market).id];
    setConfig({ ...defaults, assets, timeframe: config.timeframe, costs: { ...MARKETS[market].defaultCosts } });
  };

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title={initial.fromLab ? `Replaying ${config.name}` : "Choose what to replay"} description={initial.fromLab ? "Opened from the Lab with its exact configuration and period." : "Library defaults; open a configured strategy from the Lab for its exact settings."} />
        <PanelBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,2fr)] lg:items-end">
          <Field label="Strategy" htmlFor="rp-kind">
            <Select id="rp-kind" value={config.params.kind} onChange={(e) => setKind(e.target.value as StrategyKind)}>
              {STRATEGY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {STRATEGY_LIBRARY[k].name}
                </option>
              ))}
            </Select>
          </Field>
          <InstrumentPicker
            label={config.params.kind === "momentum_rotation" ? "Instruments" : "Instrument"}
            value={config.assets}
            onChange={(ids) => setConfig({ ...config, assets: ids })}
            market={market}
            onMarketChange={(m) => setConfig({ ...config, assets: config.params.kind === "momentum_rotation" ? [...rotationPair(m)] : [defaultInstrument(m).id], costs: { ...MARKETS[m].defaultCosts } })}
            max={config.params.kind === "momentum_rotation" ? 4 : 1}
            min={config.params.kind === "momentum_rotation" ? 2 : 1}
          />
          <Field label="Timeframe">
            <Segmented<Timeframe>
              label="Timeframe"
              value={config.timeframe}
              onChange={(t) => setConfig({ ...config, timeframe: t })}
              options={[
                { value: "1h", label: "1h" },
                { value: "4h", label: "4h" },
                { value: "1d", label: "1d" },
              ]}
            />
          </Field>
          {dataRange && effectivePeriod ? <PeriodPicker period={effectivePeriod} onChange={setPeriod} dataStart={dataRange.start} dataEnd={dataRange.end} compact /> : <Skeleton className="h-9 w-48" />}
        </PanelBody>
      </Panel>

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}
      {loading && !series ? <Skeleton className="h-[420px] w-full" /> : null}
      {prepared && "error" in prepared ? <ErrorState title="This replay cannot run" body={prepared.error} /> : null}
      {prepared && !("error" in prepared) ? (
        prepared.candles.length < 2 ? (
          <EmptyState title="Not enough bars" body="Choose a longer period or a faster timeframe." />
        ) : (
          <ReplayPlayer key={`${prepared.result.id}`} result={prepared.result} candles={prepared.candles} display={prepared.display} events={prepared.events} config={config} />
        )
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function ReplayPlayer({ result, candles, display, events, config }: { result: BacktestResult; candles: Candle[]; display: IndicatorDisplay[]; events: ReplayEvent[]; config: StrategyConfig }) {
  const currency = result.currency;
  const last = candles.length - 1;
  const firstInteresting = useMemo(() => {
    const firstEvent = events[0] ? candles.findIndex((c) => c.time === events[0].time) : -1;
    return Math.max(0, Math.min(last, firstEvent === -1 ? Math.min(40, last) : Math.max(0, firstEvent - 30)));
  }, [events, candles, last]);

  const [cursor, setCursor] = useState(firstInteresting);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);
  const cursorRef = useRef(cursor);
  const speedRef = useRef<Speed>(speed);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Playback loop with rAF; transient timing lives in refs.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let acc = 0;
    let lastTs = performance.now();
    const tick = (ts: number) => {
      const dt = ts - lastTs;
      lastTs = ts;
      acc += (dt / 1000) * speedRef.current;
      const steps = Math.floor(acc);
      if (steps > 0) {
        acc -= steps;
        const next = Math.min(last, cursorRef.current + steps);
        if (next !== cursorRef.current) setCursor(next);
        if (next >= last) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, last]);

  const step = useCallback((d: number) => setCursor((c) => Math.max(0, Math.min(last, c + d))), [last]);
  const jumpNext = useCallback(() => {
    const idx = nextEventIndex(candles, events, cursorRef.current);
    setCursor(idx ?? last);
  }, [candles, events, last]);
  const jumpPrev = useCallback(() => {
    const idx = prevEventIndex(candles, events, cursorRef.current);
    setCursor(idx ?? 0);
  }, [candles, events]);

  // Keyboard: space, arrows, home/end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) jumpNext();
        else step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) jumpPrev();
        else step(-1);
      } else if (e.key === "Home") setCursor(0);
      else if (e.key === "End") setCursor(last);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, jumpNext, jumpPrev, last]);

  const frame = useMemo(() => frameAt(result, candles, events, display, cursor), [result, candles, events, display, cursor]);

  const markers = useMemo<PriceMarker[]>(
    () => events.map((e) => ({ time: e.time, kind: e.kind, text: `${e.n}` })),
    [events],
  );

  const openTrade = frame?.open ?? null;
  const stopLossPct = config.risk.stopLossPct;
  const takeProfitPct = config.risk.takeProfitPct;
  const priceLines = useMemo<PriceLineSpec[]>(() => {
    if (!openTrade) return [];
    const lines: PriceLineSpec[] = [{ price: openTrade.entryPrice, color: "var(--annot)", title: "entry", style: "solid" }];
    if (stopLossPct !== null) lines.push({ price: openTrade.entryPrice * (1 - stopLossPct), color: "var(--down)", title: "stop", style: "dashed" });
    if (takeProfitPct !== null) lines.push({ price: openTrade.entryPrice * (1 + takeProfitPct), color: "var(--up)", title: "take profit", style: "dashed" });
    return lines;
  }, [openTrade, stopLossPct, takeProfitPct]);

  const equitySoFar = useMemo(() => result.equity.slice(0, cursor + 1), [result.equity, cursor]);
  const visibleEvents = frame?.events ?? [];
  const eventsRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = eventsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleEvents.length]);

  const desktop = useIsDesktop();
  if (!frame) return null;
  const totalPnl = frame.equity - result.assumptions.initialCapital;
  const windowBars = config.timeframe === "1d" ? 90 : 120;
  const hasOscillator = display.some((d) => d.pane === "oscillator");
  const chartHeight = desktop ? (hasOscillator ? 460 : 380) : hasOscillator ? 340 : 260;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:gap-5 lg:items-start">
      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title={config.name}
            description={
              <>
                {config.assets.join(" + ")} · {config.timeframe} bars · bar {cursor + 1} of {candles.length} · <span className="num text-ink-2">{fmtDateTime(frame.time)}</span>
              </>
            }
            aside={<SimulatedBadge />}
          />
          {frame.open ? <OpenTradeDimension frame={frame} currency={currency} /> : null}
          <div className="px-1 pt-2">
            <PriceChart
              candles={candles}
              indicators={result.indicators}
              display={display}
              markers={markers}
              priceLines={priceLines}
              visibleCount={cursor + 1}
              followLatest
              windowBars={windowBars}
              height={chartHeight}
            />
          </div>

          {/* Transport controls */}
          <div className="border-t border-hairline px-3 py-3">
            <input
              type="range"
              min={0}
              max={last}
              value={cursor}
              onChange={(e) => {
                setPlaying(false);
                setCursor(Number(e.target.value));
              }}
              aria-label="Replay position"
              aria-valuetext={fmtDateTime(frame.time)}
              className="h-1.5 w-full cursor-pointer"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <IconButton label="Jump to start" onClick={() => setCursor(0)}>
                  <ChevronFirst className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Previous trade event (Shift+←)" onClick={jumpPrev}>
                  <SkipBack className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Step back one bar (←)" onClick={() => step(-1)}>
                  <StepBack className="size-4" aria-hidden />
                </IconButton>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? "Pause (space)" : "Play (space)"}
                  aria-pressed={playing}
                  className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-ink px-4 text-sm font-medium text-ground hover:bg-[#fffdf7]"
                >
                  {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  <span className="hidden sm:inline">{playing ? "Pause" : cursor >= last ? "Replay ended" : "Play"}</span>
                </button>
                <IconButton label="Step forward one bar (→)" onClick={() => step(1)}>
                  <StepForward className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Next trade event (Shift+→)" onClick={jumpNext}>
                  <SkipForward className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Jump to end" onClick={() => setCursor(last)}>
                  <ChevronLast className="size-4" aria-hidden />
                </IconButton>
              </div>
              <div role="radiogroup" aria-label="Playback speed" className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-raised p-0.5">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={speed === s}
                    onClick={() => setSpeed(s)}
                    className={cn("num h-full min-w-11 rounded-[3px] px-2 text-xs", speed === s ? "bg-ink text-ground" : "text-ink-2 hover:text-ink")}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-2xs text-ink-3">The strategy only ever saw bars to the left of the cursor. Speeds are bars per second.</p>
          </div>

          <ProvenancePlate source={result.source} period={result.period} bars={result.period.bars} timeframe={result.timeframe} feeBps={result.assumptions.feeBps} slippageBps={result.assumptions.slippageBps} />
        </Panel>

        {/* Portfolio state at the cursor */}
        <Panel>
          <PanelHeader title="Simulated portfolio at this bar" aside={<SimulatedBadge />} />
          <PanelBody>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Stat label="Equity" value={fmtMoney(frame.equity, { currency })} size="md" />
              <Stat label="Total P&L" value={fmtMoney(totalPnl, { cents: Math.abs(totalPnl) < 100, currency })} tone={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "neutral"} size="md" sub={`${fmtMoney(frame.realisedPnl, { currency })} realised`} />
              <Stat label="Drawdown now" value={fmtPct(-frame.drawdown * 100)} tone={frame.drawdown > 0.0005 ? "down" : "muted"} size="md" sub="from the running peak" />
              <Stat
                label="Position"
                value={frame.open ? `${fmtNum(frame.open.quantity, frame.open.quantity < 1 ? 4 : 2)} ${frame.open.asset}` : "Cash"}
                size="md"
                tone={frame.open ? "neutral" : "muted"}
                sub={frame.open ? `${fmtPct(frame.exposure * 100, { digits: 0 })} of equity · entered ${fmtPrice(frame.open.entryPrice, currency)}` : "No open position"}
              />
            </div>
            <div className="mt-4 border-t border-hairline pt-3">
              <EquityChart series={[{ id: "eq", name: "Equity", points: equitySoFar, color: "var(--series-1)" }]} height={96} compact />
            </div>
          </PanelBody>
        </Panel>
      </div>

      {/* Why column */}
      <div className="mt-5 space-y-5 lg:mt-0">
        <Panel>
          <PanelHeader title="Why" description="What the strategy knew and decided at this bar." />
          <PanelBody className="space-y-3">
            {frame.fillBarEntry ? (
              <Callout tone="annot" title="Filled at this bar's open">
                The signal fired at the previous bar&apos;s close. The buy filled here at {fmtPrice(frame.fillBarEntry.entryPrice, currency)}, including slippage, so the strategy never traded on a price it had not yet seen.
              </Callout>
            ) : null}
            {frame.fillBarExit ? (
              <Callout tone={frame.fillBarExit.pnl >= 0 ? "up" : "down"} title={`Closed: ${frame.fillBarExit.exitReasonText}`}>
                Exit at {fmtPrice(frame.fillBarExit.exitPrice, currency)} for {fmtMoney(frame.fillBarExit.pnl, { cents: true, currency })} ({fmtPct(frame.fillBarExit.returnPct * 100, { sign: true })}) after fees.
              </Callout>
            ) : null}
            {frame.lastNote ? (
              <div>
                <div className="text-xs text-ink-3">
                  Latest decision · <span className="num">{fmtDateTime(frame.lastNote.time)}</span>
                </div>
                <p className="mt-1 text-sm text-ink leading-5">{frame.lastNote.note}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-2">No signal yet. The strategy is waiting for its conditions, or still warming up its indicators.</p>
            )}
            {frame.indicatorValues.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-xs">
                <div>
                  <dt className="text-ink-3">Close</dt>
                  <dd className="num text-ink">{fmtPrice(frame.candle.close, currency)}</dd>
                </div>
                {frame.indicatorValues.map((v) => (
                  <div key={v.label}>
                    <dt className="text-ink-3">{v.label}</dt>
                    <dd className="num text-ink">{v.value === null ? "warming up" : v.pane === "price" ? fmtPrice(v.value, currency) : fmtNum(v.value, Math.abs(v.value) < 10 ? 3 : 1)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {frame.open ? (
              <div className="border-t border-hairline pt-3 text-xs">
                <div className="text-ink-3">Open trade</div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="num text-ink-2">
                    {fmtPrice(frame.open.entryPrice, currency)} → {fmtPrice(frame.candle.close, currency)}
                  </span>
                  <span className={cn("num font-medium", signClass(frame.openPnl))}>
                    {fmtMoney(frame.openPnl, { cents: Math.abs(frame.openPnl) < 100, currency })} · {fmtPct(frame.openPnlPct, { sign: true })}
                  </span>
                </div>
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title={`Trade events (${visibleEvents.length} of ${events.length})`} description="Each entry and exit, numbered as on the chart." />
          {visibleEvents.length === 0 ? (
            <EmptyState title="No trades yet" body="Press play or jump to the next event." className="py-5" />
          ) : (
            <ol ref={eventsRef} className="max-h-[360px] divide-y divide-hairline overflow-y-auto lg:max-h-[520px]">
              {visibleEvents.map((e) => (
                <li key={`${e.n}`} className={cn("flex gap-3 px-4 py-2.5", e.time === frame.time ? "bg-annot-dim" : "")}>
                  <span className={cn("num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] text-2xs", e.kind === "entry" ? "bg-up-dim text-up" : "bg-down-dim text-down")} aria-hidden>
                    {e.n}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-medium text-ink">
                        {e.kind === "entry" ? "Buy" : "Sell"} {e.trade.asset} at {fmtPrice(e.kind === "entry" ? e.trade.entryPrice : e.trade.exitPrice, currency)}
                      </span>
                      <span className="num text-2xs text-ink-3">{fmtDateTime(e.time)}</span>
                      {e.kind === "exit" ? (
                        <Badge tone={e.trade.pnl >= 0 ? "up" : "down"} className="num">
                          {fmtPct(e.trade.returnPct * 100, { sign: true })}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-2 leading-4">{e.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/** A live dimension line for the open trade: entry → mark, bracketed, with the signed P&L. */
function OpenTradeDimension({ frame, currency }: { frame: NonNullable<ReturnType<typeof frameAt>>; currency: Currency }) {
  const t = frame.open!;
  const up = frame.openPnl >= 0;
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <div className="flex items-center gap-3 border-b border-hairline bg-raised/40 px-4 py-2 text-xs" aria-live="polite">
      <svg width="12" height="28" viewBox="0 0 12 28" aria-hidden className="shrink-0">
        <line x1="6" x2="6" y1="2" y2="26" stroke={color} strokeWidth="1" />
        <line x1="2" x2="10" y1="2" y2="2" stroke={color} strokeWidth="1" />
        <line x1="2" x2="10" y1="26" y2="26" stroke={color} strokeWidth="1" />
        <path d={up ? "M3 7 L6 2 L9 7" : "M3 21 L6 26 L9 21"} fill="none" stroke={color} strokeWidth="1" />
      </svg>
      <span className="text-ink-3">Open trade</span>
      <span className="num text-ink-2">
        {fmtPrice(t.entryPrice, currency)} → {fmtPrice(frame.candle.close, currency)}
      </span>
      <span className={cn("num ml-auto font-medium", signClass(frame.openPnl))}>
        {fmtPct(frame.openPnlPct, { sign: true })} · {fmtMoney(frame.openPnl, { cents: Math.abs(frame.openPnl) < 100, currency })}
      </span>
    </div>
  );
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

function Callout({ tone, title, children }: { tone: "annot" | "up" | "down"; title: string; children: React.ReactNode }) {
  const cls = { annot: "border-annot/40 bg-annot-dim", up: "border-up/40 bg-up-dim", down: "border-down/40 bg-down-dim" }[tone];
  return (
    <div className={cn("rounded-[var(--radius-sm)] border px-3 py-2", cls)}>
      <div className="text-xs font-medium text-ink">{title}</div>
      <p className="mt-0.5 text-xs text-ink-2 leading-4">{children}</p>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className="size-11">
      {children}
    </Button>
  );
}
