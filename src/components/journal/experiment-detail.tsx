"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Check, FlaskConical, Link2, Trash2 } from "lucide-react";
import { EquityChart, type EquitySeries } from "@/components/charts/equity-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/field";
import { PageHeader, Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProvenancePlate } from "@/components/ui/provenance";
import { VerdictBadge } from "@/components/ui/verdict";
import { Legend, MetricsTable, SERIES_COLORS, describeParams } from "@/components/lab/results";
import { currencyOf, marketOf } from "@/lib/market/instruments";
import { fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, signClass, timeframeLabel } from "@/lib/format";
import { describeChanges, describeSizing, diffConfigs, experimentSource, PARAM_LABELS } from "@/lib/journal/lineage";
import type { PerformanceMetrics } from "@/lib/quant/types";
import { encodeSnapshot } from "@/lib/store/snapshot";
import type { Experiment } from "@/lib/store/types";
import { getStore, selectExperiments, useRepository } from "@/lib/store/use-store";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { cn } from "@/lib/utils";

export function ExperimentDetail({ id }: { id: string }) {
  const router = useRouter();
  const { items, loading, refresh, remove } = useRepository(selectExperiments);
  const experiment = useMemo(() => items?.find((e) => e.id === id) ?? null, [items, id]);
  const versions = useMemo(() => (experiment && items ? items.filter((e) => e.lineageId === experiment.lineageId).sort((a, b) => a.version - b.version) : []), [items, experiment]);

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!experiment) {
    return (
      <div>
        <PageHeader title="Experiment not found" />
        <Panel>
          <EmptyState
            title="This experiment is not in your journal"
            body="Experiments are stored in this browser. If you saved it on another device, it will not appear here."
            action={
              <Button asChild>
                <Link href="/journal">Back to the journal</Link>
              </Button>
            }
          />
        </Panel>
      </div>
    );
  }

  const onDelete = async () => {
    if (!window.confirm(`Delete version ${experiment.version} of "${experiment.name}"? This cannot be undone.`)) return;
    await remove(experiment.id);
    router.push("/journal");
  };

  return <Detail experiment={experiment} versions={versions} onSaved={refresh} onDelete={onDelete} />;
}

function Detail({ experiment: e, versions, onSaved, onDelete }: { experiment: Experiment; versions: Experiment[]; onSaved: () => void; onDelete: () => void }) {
  const snapshot = useMemo(() => {
    try {
      return encodeSnapshot({ v: 1, config: e.config, start: e.period.start, end: e.period.end, data: e.dataset.version, title: e.name });
    } catch {
      return null;
    }
  }, [e]);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${snapshot}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [snapshot]);

  const source = experimentSource(e);
  const meta = STRATEGY_LIBRARY[e.config.params.kind];
  const m = e.result.metrics as unknown as PerformanceMetrics;
  const bench = e.result.benchmark;
  const previous = versions.filter((v) => v.version < e.version).sort((a, b) => b.version - a.version)[0] ?? null;
  const changes = previous ? diffConfigs(previous.config, e.config) : [];

  return (
    <div>
      <PageHeader
        title={e.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {e.result.verdict ? <VerdictBadge verdict={e.result.verdict} size="sm" /> : null}
            <Badge tone="muted">Version {e.version}</Badge>
            <span>
              {meta.name} · {e.assets.join("+")} · {timeframeLabel(e.timeframe)} · tested {fmtDateTime(e.createdAt)}
            </span>
          </span>
        }
        actions={
          <>
            <Button variant="primary" asChild>
              <Link href={snapshot ? `/lab/build?s=${snapshot}` : "/lab/build"}>
                <FlaskConical className="size-4" aria-hidden /> Open in Lab
              </Link>
            </Button>
            <Button onClick={copy} disabled={!snapshot}>
              {copied ? <Check className="size-4 text-up" aria-hidden /> : <Link2 className="size-4" aria-hidden />} {copied ? "Link copied" : "Share"}
            </Button>
            <Button variant="ghost" onClick={onDelete} aria-label="Delete this version">
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Hero label="Total return" value={fmtPct(m.totalReturnPct, { sign: true })} cls={signClass(m.totalReturnPct)} sub={bench ? `${bench.name} ${fmtPct(bench.metrics.totalReturnPct as number, { sign: true })}` : undefined} />
          <Hero label="Max drawdown" value={fmtPct(-(m.maxDrawdownPct ?? 0))} cls="text-down" sub={bench ? `${bench.name} ${fmtPct(-((bench.metrics.maxDrawdownPct as number) ?? 0))}` : undefined} />
          <Hero label="Sharpe ratio" value={m.sharpe === null || m.sharpe === undefined ? "–" : fmtNum(m.sharpe)} cls={m.sharpe === null || m.sharpe === undefined ? "text-ink-3" : m.sharpe > 1 ? "text-up" : m.sharpe < 0 ? "text-down" : "text-ink"} sub={m.sharpe === null || m.sharpe === undefined ? "Not enough data" : undefined} />
          <Hero label="Trades" value={fmtInt(m.tradeCount)} cls={m.tradeCount < 30 ? "text-warn" : "text-ink"} sub={m.winRatePct === null || m.winRatePct === undefined ? "No completed trades" : `${fmtPct(m.winRatePct, { digits: 0 })} winners`} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Hypothesis" description="What you expected before running it." />
            <PanelBody>
              {e.hypothesis ? <p className="text-sm text-ink leading-5 whitespace-pre-wrap">{e.hypothesis}</p> : <p className="text-sm text-ink-3">No hypothesis was recorded.</p>}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Parameters" description={describeParams(e.config.params)} />
            <PanelBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <Def label="Strategy" value={meta.name} />
                <Def label="Asset" value={e.config.assets.join(" + ")} />
                <Def label="Timeframe" value={timeframeLabel(e.config.timeframe)} />
                <Def label="Stop loss" value={e.config.risk.stopLossPct === null ? "None" : fmtPct(e.config.risk.stopLossPct * 100)} />
                <Def label="Take profit" value={e.config.risk.takeProfitPct === null ? "None" : fmtPct(e.config.risk.takeProfitPct * 100)} />
                <Def label="Position sizing" value={describeSizing(e.config.risk.sizing)} />
                <Def label="Max positions" value={String(e.config.risk.maxPositions)} />
                <Def label="Costs" value={`${e.config.costs.feeBps}bp fee · ${e.config.costs.slippageBps}bp slippage`} />
                <Def label="Starting capital" value={`$${e.config.initialCapital.toLocaleString("en-US")}`} />
              </dl>
              {previous ? (
                <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-2 leading-4">
                  <span className="text-ink-3">Changes since version {previous.version}: </span>
                  {describeChanges(changes)}
                </p>
              ) : null}
            </PanelBody>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Equity curve" description="Stored at save time, downsampled. Open in the Lab to recompute at full resolution." />
          <div className="px-2 pt-3 pb-1">
            <EquityChart series={[{ id: "e", name: e.name, points: e.result.equity, color: SERIES_COLORS[0] }]} height={240} />
          </div>
          <ProvenancePlate source={source} period={e.period} bars={e.period.bars} timeframe={e.timeframe} feeBps={e.config.costs.feeBps} slippageBps={e.config.costs.slippageBps} feeFixed={e.config.costs.feeFixed} currency={currencyOf(e.assets[0])} market={marketOf(e.assets[0])} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Results" description={bench ? `Against ${bench.name.toLowerCase()} under identical costs.` : undefined} />
            <PanelBody className="px-0 pt-0">
              <MetricsTable
                timeframe={e.timeframe}
                currency={currencyOf(e.assets[0])}
                columns={[{ name: "Strategy", metrics: m, color: SERIES_COLORS[0] }, ...(bench ? [{ name: bench.name, metrics: bench.metrics as unknown as PerformanceMetrics }] : [])]}
                compactRows={["totalReturnPct", "cagrPct", "maxDrawdownPct", "sharpe", "sortino", "tradeCount", "winRatePct", "profitFactor", "exposurePct", "totalFees"]}
              />
              {e.result.warnings.length ? (
                <ul className="mt-3 space-y-1 px-4">
                  {e.result.warnings.map((w) => (
                    <li key={w} className="flex gap-2 text-xs text-warn leading-4">
                      <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-current" />
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </PanelBody>
          </Panel>
          <div className="space-y-5">
            <EditableNotes key={`${e.id}-findings`} experiment={e} field="findings" title="Findings" description="What the result actually showed." onSaved={onSaved} />
            <EditableNotes key={`${e.id}-weaknesses`} experiment={e} field="weaknesses" title="Weaknesses" description="Where this idea could fall apart." onSaved={onSaved} />
          </div>
        </div>

        {versions.length > 1 ? <VersionComparison versions={versions} current={e} /> : null}
      </div>
    </div>
  );
}

function Hero({ label, value, cls, sub }: { label: string; value: string; cls: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-3 leading-4">{label}</div>
      <div className={cn("num-hero mt-1 text-3xl leading-none", cls)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-3 leading-4">{sub}</div> : null}
    </div>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function EditableNotes({ experiment, field, title, description, onSaved }: { experiment: Experiment; field: "findings" | "weaknesses"; title: string; description: string; onSaved: () => void }) {
  const [value, setValue] = useState(experiment[field]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = value !== experiment[field];
  const save = async () => {
    setStatus("saving");
    await getStore().experiments.put({ ...experiment, [field]: value.trim() });
    onSaved();
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  };
  return (
    <Panel>
      <PanelHeader title={title} description={description} aside={dirty ? <Button size="sm" variant="primary" onClick={save} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save"}</Button> : status === "saved" ? <span className="text-xs text-up">Saved</span> : null} />
      <PanelBody>
        <Textarea aria-label={title} value={value} maxLength={5000} onChange={(ev) => setValue(ev.target.value)} className="min-h-28 text-sm" placeholder={field === "findings" ? "What did the result actually show?" : "Where could this fall apart?"} />
      </PanelBody>
    </Panel>
  );
}

function VersionComparison({ versions, current }: { versions: Experiment[]; current: Experiment }) {
  const series = useMemo<EquitySeries[]>(
    () =>
      versions.map((v, i) => ({
        id: v.id,
        name: `v${v.version}`,
        points: v.result.equity,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      })),
    [versions],
  );
  return (
    <Panel>
      <PanelHeader title={`Versions (${versions.length})`} description="Every version of this idea. Curves are rebased to 0% so different periods and capital compare fairly." />
      <div className="px-2 pt-3 pb-1">
        <EquityChart series={series} mode="percent" height={240} />
      </div>
      <Legend series={series} />
      <div className="overflow-x-auto border-t border-hairline">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Tested</th>
              <th scope="col">Changes from previous</th>
              <th scope="col" className="num">Return</th>
              <th scope="col" className="num">Max DD</th>
              <th scope="col" className="num">Sharpe</th>
              <th scope="col" className="num">Trades</th>
              <th scope="col">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => {
              const prev = i > 0 ? versions[i - 1] : null;
              const changes = prev ? diffConfigs(prev.config, v.config) : [];
              const vm = v.result.metrics;
              const isCurrent = v.id === current.id;
              return (
                <tr key={v.id} className={isCurrent ? "bg-raised/60" : ""}>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} aria-hidden />
                      {isCurrent ? <span className="text-ink">v{v.version}</span> : <Link href={`/journal/${v.id}`} className="text-ink-2 hover:text-ink hover:underline underline-offset-2">v{v.version}</Link>}
                    </span>
                  </td>
                  <td className="num text-ink-2 whitespace-nowrap">{fmtDate(v.createdAt)}</td>
                  <td className="text-xs text-ink-2">
                    {prev ? (
                      changes.length ? (
                        <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                          {changes.map((c) => (
                            <li key={c.key} className="whitespace-nowrap">
                              <span className="text-ink-3">{PARAM_LABELS[c.key] ?? c.key}</span> <span className="num text-ink-3 line-through">{c.from}</span> <span className="num text-annot">{c.to}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-ink-3">Same parameters</span>
                      )
                    ) : (
                      <span className="text-ink-3">First version</span>
                    )}
                  </td>
                  <td className={cn("num", signClass(vm.totalReturnPct))}>{fmtPct(vm.totalReturnPct, { sign: true })}</td>
                  <td className="num text-down">{fmtPct(-(vm.maxDrawdownPct ?? 0))}</td>
                  <td className="num text-ink-2">{vm.sharpe === null || vm.sharpe === undefined ? "–" : fmtNum(vm.sharpe)}</td>
                  <td className="num text-ink-2">{fmtInt(vm.tradeCount)}</td>
                  <td>{v.result.verdict ? <VerdictBadge verdict={v.result.verdict} size="sm" /> : <span className="text-ink-3">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
