"use client";

/**
 * The strategy library: every strategy with its plain-English summary and
 * its default-configuration result on the demo data over the last two years,
 * so the user can see at a glance that most ideas do not beat buy and hold.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { ProvenancePlate } from "@/components/ui/provenance";
import { fmtInt, fmtNum, fmtPct, signClass } from "@/lib/format";
import { defaultPeriod } from "@/lib/lab/run";
import { useCandles } from "@/lib/market/client";
import { runBacktest } from "@/lib/quant/backtest";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import { cn } from "@/lib/utils";

export function StrategyLibrary() {
  const { series, error, loading } = useCandles(["BTC", "ETH"], "4h");
  const rows = useMemo(() => {
    if (!series) return null;
    const period = defaultPeriod(series);
    return STRATEGY_ORDER.map((kind) => {
      const meta = STRATEGY_LIBRARY[kind];
      const config = { ...meta.defaults, timeframe: "4h" as const };
      try {
        const result = runBacktest(config, series, period);
        return { kind, meta, result };
      } catch {
        return { kind, meta, result: null };
      }
    });
  }, [series]);

  const bh = rows?.find((r) => r.kind === "buy_and_hold")?.result ?? null;

  if (error) return <ErrorState title="Market data unavailable" body={error} />;

  return (
    <div className="rounded-[var(--radius-md)] border border-hairline bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Library</h2>
        <p className="text-xs text-ink-3">Default settings on BTC, 4h bars, last two years. Beating buy and hold is the bar.</p>
      </div>
      <ul className="divide-y divide-hairline">
        {(rows ?? STRATEGY_ORDER.map((kind) => ({ kind, meta: STRATEGY_LIBRARY[kind], result: null }))).map(({ kind, meta, result }) => {
          const m = result?.metrics ?? null;
          const beats = m && bh ? m.totalReturnPct > bh.metrics.totalReturnPct && (m.sharpe ?? -1) > (bh.metrics.sharpe ?? -1) : null;
          return (
            <li key={kind}>
              <Link href={`/lab/build?kind=${kind}`} className="group grid grid-cols-4 items-center gap-x-3 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-hover sm:grid-cols-[minmax(0,1fr)_96px_repeat(3,72px)_100px] sm:gap-x-4">
                <div className="col-span-4 min-w-0 sm:col-span-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-ink group-hover:underline underline-offset-2">{meta.name}</h3>
                    {meta.benchmark ? <Badge tone="muted">Benchmark</Badge> : null}
                    {beats === true && !meta.benchmark ? <Badge tone="up">Beats buy &amp; hold</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-2 leading-4 sm:max-w-[60ch]">{meta.summary}</p>
                </div>
                <div className="hidden sm:block">{result ? <Sparkline values={result.equity.map((p) => p.equity)} tone={m && m.totalReturnPct >= 0 ? "up" : "down"} /> : <Skeleton className="h-7 w-24" />}</div>
                <Cell label="Return" value={m ? fmtPct(m.totalReturnPct, { sign: true }) : null} cls={m ? signClass(m.totalReturnPct) : ""} loading={loading} />
                <Cell label="Max DD" value={m ? fmtPct(-m.maxDrawdownPct) : null} cls="text-down" loading={loading} />
                <Cell label="Sharpe" value={m ? (m.sharpe === null ? "–" : fmtNum(m.sharpe)) : null} cls="text-ink-2" loading={loading} />
                <Cell label="Trades" value={m ? fmtInt(m.tradeCount) : null} cls="text-ink-2" loading={loading} />
              </Link>
            </li>
          );
        })}
      </ul>
      {series ? <ProvenancePlate source={series[0].source} period={defaultPeriod(series)} timeframe="4h" feeBps={10} slippageBps={5} /> : null}
    </div>
  );
}

function Cell({ label, value, cls, loading }: { label: string; value: string | null; cls: string; loading: boolean }) {
  return (
    <div className="sm:text-right">
      <span className="block text-2xs text-ink-3">{label}</span>
      {value === null ? loading ? <Skeleton className="inline-block h-3.5 w-12" /> : <span className="text-xs text-ink-4">–</span> : <span className={cn("num text-xs", cls)}>{value}</span>}
    </div>
  );
}
