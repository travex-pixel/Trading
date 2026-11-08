"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { EquityChart, type EquitySeries } from "@/components/charts/equity-chart";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/empty";
import { Select } from "@/components/ui/field";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { describeTradeoffs, useCompareBasket, MAX_COMPARE } from "@/lib/lab/compare";
import { defaultPeriod } from "@/lib/lab/run";
import { useCandles } from "@/lib/market/client";
import { runBacktest } from "@/lib/quant/backtest";
import { buyAndHoldConfig } from "@/lib/quant/benchmarks";
import type { Timeframe } from "@/lib/quant/types";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyKind } from "@/lib/strategies/schema";
import { Legend, MetricsTable, SERIES_COLORS } from "./results";
import { PeriodPicker } from "./period-picker";
import type { Period } from "@/lib/quant/validation";

export function ComparePanel() {
  const basket = useCompareBasket();
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [period, setPeriod] = useState<Period | null>(null);
  const { series, error, loading } = useCandles(["BTC", "ETH"], timeframe);

  const dataRange = useMemo(() => (series ? { start: series[0].candles[0].time, end: series[0].candles[series[0].candles.length - 1].time } : null), [series]);
  const effective = useMemo<Period | null>(() => {
    if (!series || !dataRange) return null;
    return period ? { start: Math.max(dataRange.start, period.start), end: Math.min(dataRange.end, period.end) } : defaultPeriod(series);
  }, [series, dataRange, period]);

  const runs = useMemo(() => {
    if (!series || !effective) return null;
    const out = basket.items.map((item, i) => {
      const config = { ...item.config, timeframe };
      try {
        return { id: item.id, name: config.name, config, result: runBacktest(config, series, effective), color: SERIES_COLORS[i % SERIES_COLORS.length], error: null as string | null };
      } catch (err) {
        return { id: item.id, name: config.name, config, result: null, color: SERIES_COLORS[i % SERIES_COLORS.length], error: err instanceof Error ? err.message : "Could not run." };
      }
    });
    const first = basket.items[0]?.config;
    const bench = first ? runBacktest(buyAndHoldConfig({ ...first, timeframe }), series, effective) : null;
    return { out, bench };
  }, [series, effective, basket.items, timeframe]);

  const equity = useMemo<EquitySeries[]>(() => {
    if (!runs) return [];
    const s: EquitySeries[] = runs.out.filter((r) => r.result).map((r) => ({ id: r.id, name: r.name, points: r.result!.equity, color: r.color }));
    if (runs.bench) s.push({ id: "bh", name: "Buy and hold", points: runs.bench.equity, color: "var(--series-muted)", muted: true });
    return s;
  }, [runs]);

  const tradeoffs = useMemo(() => (runs ? describeTradeoffs(runs.out.filter((r) => r.result).map((r) => ({ name: r.name, result: r.result! }))) : []), [runs]);

  if (!basket.loaded) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title={`Strategies (${basket.items.length}/${MAX_COMPARE})`} description="Add from the Lab, or pick library defaults here." aside={basket.items.length ? <Button size="sm" variant="ghost" onClick={basket.clear}>Clear</Button> : null} />
        <PanelBody>
          <ul className="flex flex-wrap gap-2">
            {basket.items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-raised py-1 pl-2.5 pr-1 text-sm">
                <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
                <span className="text-ink">{item.config.name}</span>
                <button type="button" onClick={() => basket.remove(item.id)} aria-label={`Remove ${item.config.name}`} className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink">
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {basket.items.length < MAX_COMPARE ? (
              <li className="w-56">
                <Select
                  aria-label="Add a library strategy"
                  value=""
                  onChange={(e) => {
                    const kind = e.target.value as StrategyKind;
                    if (kind in STRATEGY_LIBRARY) basket.add(STRATEGY_LIBRARY[kind].defaults);
                  }}
                >
                  <option value="">Add library strategy…</option>
                  {STRATEGY_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {STRATEGY_LIBRARY[k].name}
                    </option>
                  ))}
                </Select>
              </li>
            ) : null}
          </ul>
          {dataRange ? (
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-hairline pt-4">
              <PeriodPicker period={effective!} onChange={setPeriod} dataStart={dataRange.start} dataEnd={dataRange.end} compact />
              <div>
                <span className="block text-xs font-medium text-ink-2">Timeframe</span>
                <div className="mt-1.5 inline-flex rounded-[var(--radius-md)] border border-border bg-raised p-0.5" role="radiogroup" aria-label="Timeframe">
                  {(["1h", "4h", "1d"] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={timeframe === t} onClick={() => setTimeframe(t)} className={`h-6 rounded-[3px] px-2 text-2xs font-medium ${timeframe === t ? "bg-ink text-ground" : "text-ink-2"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      {error ? <ErrorState title="Market data unavailable" body={error} /> : null}
      {basket.items.length === 0 ? (
        <EmptyState
          title="Nothing to compare yet"
          body="Open a strategy in the Lab and press Compare, or add two library strategies above. Comparing against buy and hold happens automatically."
          action={
            <Button asChild variant="primary">
              <Link href="/lab">Open the Lab</Link>
            </Button>
          }
        />
      ) : null}
      {loading && !series && basket.items.length ? <Skeleton className="h-72 w-full" /> : null}

      {runs && basket.items.length ? (
        <>
          <Panel>
            <PanelHeader title="Equity curves" description="Each rebased to 0% at the start so different capital does not distort the picture." />
            <div className="px-2 pt-3 pb-1">
              <EquityChart series={equity} mode="percent" height={300} />
            </div>
            <Legend series={equity} />
            {series ? <ProvenancePlate source={series[0].source} period={effective!} timeframe={timeframe} feeBps={basket.items[0]?.config.costs.feeBps} slippageBps={basket.items[0]?.config.costs.slippageBps} /> : null}
          </Panel>

          {tradeoffs.length ? (
            <Panel>
              <PanelHeader title="Trade-offs in plain English" />
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

          <Panel>
            <PanelHeader title="Metrics side by side" />
            <PanelBody className="px-0 pt-0">
              <MetricsTable
                timeframe={timeframe}
                highlightFirst={false}
                columns={[
                  ...runs.out.filter((r) => r.result).map((r) => ({ name: r.name, metrics: r.result!.metrics, color: r.color })),
                  ...(runs.bench ? [{ name: "Buy & hold", metrics: runs.bench.metrics }] : []),
                ]}
              />
              {runs.out.filter((r) => r.error).map((r) => (
                <p key={r.id} className="px-4 pt-2 text-xs text-down">
                  {r.name}: {r.error}
                </p>
              ))}
            </PanelBody>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
