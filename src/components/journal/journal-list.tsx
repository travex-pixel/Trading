"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { Sparkline } from "@/components/charts/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { VerdictBadge } from "@/components/ui/verdict";
import { fmtDate, fmtInt, fmtPct, signClass } from "@/lib/format";
import { groupLineages } from "@/lib/journal/lineage";
import { VERDICT_LABELS, type Verdict } from "@/lib/quant/validation";
import { selectExperiments, useRepository } from "@/lib/store/use-store";
import { STRATEGY_LIBRARY, STRATEGY_ORDER } from "@/lib/strategies/library";
import type { StrategyKind } from "@/lib/strategies/schema";
import { cn } from "@/lib/utils";

export function JournalList() {
  const { items, loading, remove } = useRepository(selectExperiments);
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState<"all" | Verdict>("all");
  const [kind, setKind] = useState<"all" | StrategyKind>("all");

  const lineages = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return groupLineages(items).filter((l) => {
      const e = l.latest;
      if (q && !e.name.toLowerCase().includes(q) && !e.hypothesis.toLowerCase().includes(q)) return false;
      if (verdict !== "all" && e.result.verdict !== verdict) return false;
      if (kind !== "all" && e.config.params.kind !== kind) return false;
      return true;
    });
  }, [items, query, verdict, kind]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (items && items.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No experiments recorded yet"
          body="The journal exists so you stop re-testing the same idea without learning anything. Every saved experiment records its hypothesis, parameters, dataset, period, results and weaknesses, and versions of one idea sit together."
          action={
            <Button variant="primary" asChild>
              <Link href="/lab/build">Run your first experiment</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const onDelete = async (lineageIds: string[], name: string, count: number) => {
    const ok = window.confirm(count > 1 ? `Delete all ${count} versions of "${name}"? This cannot be undone.` : `Delete "${name}"? This cannot be undone.`);
    if (!ok) return;
    for (const id of lineageIds) await remove(id);
  };

  return (
    <Panel>
      <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center">
        <Input aria-label="Search experiments" placeholder="Search by name or hypothesis" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs" />
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <Select aria-label="Filter by verdict" value={verdict} onChange={(e) => setVerdict(e.target.value as "all" | Verdict)} className="sm:w-44">
            <option value="all">All verdicts</option>
            {(Object.keys(VERDICT_LABELS) as Verdict[]).map((v) => (
              <option key={v} value={v}>
                {VERDICT_LABELS[v]}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by strategy" value={kind} onChange={(e) => setKind(e.target.value as "all" | StrategyKind)} className="sm:w-48">
            <option value="all">All strategies</option>
            {STRATEGY_ORDER.map((k) => (
              <option key={k} value={k}>
                {STRATEGY_LIBRARY[k].name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {lineages.length === 0 ? (
        <EmptyState title="Nothing matches these filters" body="Try a different verdict or strategy, or clear the search." />
      ) : (
        <ul className="divide-y divide-hairline">
          {lineages.map((l) => {
            const e = l.latest;
            const m = e.result.metrics;
            const b = e.result.benchmark?.metrics ?? null;
            const diff = b ? (m.totalReturnPct ?? 0) - (b.totalReturnPct ?? 0) : null;
            return (
              <li key={l.lineageId} className="px-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,1fr)_96px_104px_repeat(2,72px)_auto] sm:items-center sm:gap-x-4">
                <div className="flex items-start justify-between gap-3 sm:block">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/journal/${e.id}`} className="text-sm font-medium text-ink hover:underline underline-offset-2">
                        {e.name}
                      </Link>
                      {e.result.verdict ? <VerdictBadge verdict={e.result.verdict} size="sm" /> : null}
                      {l.versions.length > 1 ? <Badge tone="muted">{l.versions.length} versions</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-3 leading-4">
                      {STRATEGY_LIBRARY[e.config.params.kind].name} · {e.assets.join("+")} · {e.timeframe} · tested {fmtDate(e.createdAt)}
                      {e.dataset.isSynthetic ? <span className="text-warn"> · DEMO DATA</span> : null}
                    </p>
                    {e.hypothesis ? <p className="mt-1 hidden text-xs text-ink-2 leading-4 sm:block sm:max-w-[60ch] truncate">{e.hypothesis}</p> : null}
                  </div>
                  <div className="shrink-0 sm:hidden">
                    <Sparkline values={e.result.equity.map((p) => p.equity)} tone={(m.totalReturnPct ?? 0) >= 0 ? "up" : "down"} width={72} height={24} />
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Sparkline values={e.result.equity.map((p) => p.equity)} tone={(m.totalReturnPct ?? 0) >= 0 ? "up" : "down"} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:contents">
                  <Cell label="Return" value={fmtPct(m.totalReturnPct, { sign: true })} cls={signClass(m.totalReturnPct)} sub={diff !== null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} vs B&H` : undefined} />
                  <Cell label="Max DD" value={fmtPct(-(m.maxDrawdownPct ?? 0))} cls="text-down" />
                  <Cell label="Trades" value={fmtInt(m.tradeCount)} cls="text-ink-2" />
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 sm:mt-0">
                  <Button size="sm" asChild>
                    <Link href={`/journal/${e.id}`}>Open</Link>
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${e.name}`} onClick={() => onDelete(l.versions.map((v) => v.id), e.name, l.versions.length)}>
                    <Trash className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Cell({ label, value, cls, sub }: { label: string; value: string; cls: string; sub?: string }) {
  return (
    <div className="sm:text-right">
      <span className="block text-2xs text-ink-3">{label}</span>
      <span className={cn("num text-xs", cls)}>{value}</span>
      {sub ? <span className="block text-2xs text-ink-3">{sub}</span> : null}
    </div>
  );
}
