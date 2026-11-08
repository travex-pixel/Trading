"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, BookmarkPlus, Check, Link2, PlayCircle, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { useCandles } from "@/lib/market/client";
import { defaultPeriod, runLab, type LabRun } from "@/lib/lab/run";
import { useValidation } from "@/lib/lab/use-validation";
import { experimentFromRun, sameLineage, suggestedFindings, suggestedWeaknesses } from "@/lib/lab/experiments";
import { useCompareBasket } from "@/lib/lab/compare";
import { parseStrategyConfig, type StrategyConfig, type StrategyKind } from "@/lib/strategies/schema";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import { assessEdge, type Period } from "@/lib/quant/validation";
import { decodeSnapshot, encodeSnapshot } from "@/lib/store/snapshot";
import { getStore, selectExperiments, selectPortfolios, useRepository } from "@/lib/store/use-store";
import { newId } from "@/lib/store/local-store";
import type { PaperPortfolio } from "@/lib/quant/paper";
import { cn } from "@/lib/utils";
import { StrategyForm, configForKind } from "./strategy-form";
import { PeriodPicker } from "./period-picker";
import { EquityPanel, MetricsTable, RegimeTable, ResultHero, SensitivityPanel, TradesTable, VerdictPanel, WalkForwardPanel, WarningsList } from "./results";

type Tab = "overview" | "validation" | "trades";

export function Workbench() {
  const params = useSearchParams();
  const router = useRouter();

  const initial = useMemo<{ config: StrategyConfig; period: Period | null }>(() => {
    const s = params.get("s");
    if (s) {
      const decoded = decodeSnapshot(s);
      if (decoded.ok) return { config: decoded.snapshot.config, period: { start: decoded.snapshot.start, end: decoded.snapshot.end } };
    }
    const kind = params.get("kind") as StrategyKind | null;
    const config = kind && kind in STRATEGY_LIBRARY ? STRATEGY_LIBRARY[kind].defaults : STRATEGY_LIBRARY.ma_crossover.defaults;
    return { config, period: null };
  }, [params]);

  const [config, setConfig] = useState<StrategyConfig>(initial.config);
  const [period, setPeriod] = useState<Period | null>(initial.period);
  const [tab, setTab] = useState<Tab>("overview");
  const [formOpen, setFormOpen] = useState(true);
  const deferredConfig = useDeferredValue(config);
  const deferredPeriod = useDeferredValue(period);

  const { series, error, loading } = useCandles(config.assets, config.timeframe);
  const validation = useValidation();

  const dataRange = useMemo(() => {
    if (!series || series[0].candles.length === 0) return null;
    return { start: series[0].candles[0].time, end: series[0].candles[series[0].candles.length - 1].time };
  }, [series]);

  const effectivePeriod = useMemo<Period | null>(() => {
    if (!series || !dataRange) return null;
    if (!deferredPeriod) return defaultPeriod(series);
    return { start: Math.max(dataRange.start, deferredPeriod.start), end: Math.min(dataRange.end, deferredPeriod.end) };
  }, [series, dataRange, deferredPeriod]);

  const parsed = useMemo(() => parseStrategyConfig(deferredConfig), [deferredConfig]);

  const baseRun = useMemo<{ run: LabRun | null; error: string | null }>(() => {
    if (!series || !effectivePeriod || !parsed.ok) return { run: null, error: null };
    try {
      return { run: runLab(parsed.config, series, effectivePeriod), error: null };
    } catch (err) {
      return { run: null, error: err instanceof Error ? err.message : "The backtest could not run." };
    }
  }, [series, effectivePeriod, parsed]);

  const runKey = baseRun.run ? `${baseRun.run.result.id}` : null;

  // Merge validation results in when they belong to the current run.
  const run = useMemo<LabRun | null>(() => {
    const r = baseRun.run;
    if (!r) return null;
    if (validation.state.status === "done" && validation.state.forKey === runKey) {
      const v = { walkForward: validation.state.walkForward, sensitivity: validation.state.sensitivity };
      const assessment = assessEdge({ result: r.result, benchmark: r.benchmarks.buyAndHold, walkForward: v.walkForward, sensitivity: v.sensitivity, regimes: r.regimes, timeframe: r.config.timeframe });
      return { ...r, validation: v, assessment };
    }
    return r;
  }, [baseRun.run, validation.state, runKey]);

  const startValidation = useCallback(() => {
    if (!series || !run || !runKey) return;
    validation.run(run.config, series, { start: run.result.period.start, end: run.result.period.end }, runKey);
    setTab("validation");
  }, [series, run, runKey, validation]);

  const share = useShare(run);
  const compare = useCompareBasket();
  const [saveOpen, setSaveOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);

  const isStale = config !== deferredConfig || period !== deferredPeriod;

  return (
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      {/* Builder */}
      <div className="lg:sticky lg:top-6">
        <Panel>
          <PanelHeader
            title="Strategy"
            description="Structured controls only. Every change re-runs the backtest."
            aside={
              <button type="button" className="lg:hidden text-xs text-ink-2 hover:text-ink" onClick={() => setFormOpen((o) => !o)} aria-expanded={formOpen}>
                {formOpen ? "Hide" : "Edit"}
              </button>
            }
          />
          <PanelBody className={cn(formOpen ? "" : "hidden lg:block")}>
            <StrategyForm config={config} onChange={(c) => { setConfig(c); validation.reset(); }} errors={parsed.ok ? [] : parsed.errors} />
            {dataRange ? (
              <div className="mt-5 border-t border-hairline pt-4">
                <PeriodPicker period={effectivePeriod ?? { start: dataRange.start, end: dataRange.end }} onChange={(p) => { setPeriod(p); validation.reset(); }} dataStart={dataRange.start} dataEnd={dataRange.end} />
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      {/* Results */}
      <div className="mt-5 space-y-5 lg:mt-0">
        {error ? <ErrorState title="Market data unavailable" body={error} action={<Button size="sm" onClick={() => router.refresh()}>Retry</Button>} /> : null}
        {baseRun.error ? <ErrorState title="This configuration cannot run" body={baseRun.error} /> : null}
        {loading && !series ? <LoadingResults /> : null}

        {run ? (
          <div className={cn("space-y-5 transition-opacity duration-200", isStale ? "opacity-60" : "opacity-100")} aria-busy={isStale}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-lg font-semibold text-ink">{run.config.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="primary" onClick={startValidation} disabled={validation.state.status === "running" || run.config.params.kind === "buy_and_hold" || run.config.params.kind === "random_baseline"}>
                  {validation.state.status === "running" ? "Validating…" : run.validation ? "Re-run validation" : "Run full validation"}
                </Button>
                <Button size="sm" onClick={() => setSaveOpen(true)}>
                  <BookmarkPlus className="size-3.5" aria-hidden /> Save to journal
                </Button>
                <Button size="sm" onClick={() => { const n = compare.add(run.config); share.flash(`Added to compare (${n}/5)`); }}>
                  <ArrowLeftRight className="size-3.5" aria-hidden /> Compare
                </Button>
                <Button size="sm" onClick={share.copy}>
                  {share.copied ? <Check className="size-3.5 text-up" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />} {share.copied ? "Link copied" : "Share"}
                </Button>
                <Button size="sm" asChild>
                  <Link href={share.href ? `/replay?s=${share.href}` : "/replay"}>
                    <PlayCircle className="size-3.5" aria-hidden /> Replay
                  </Link>
                </Button>
                <Button size="sm" onClick={() => setPaperOpen(true)}>
                  <Wallet className="size-3.5" aria-hidden /> Paper trade
                </Button>
              </div>
            </div>
            {share.message ? (
              <p role="status" className="text-xs text-annot">
                {share.message}
                {compare.items.length >= 2 ? (
                  <>
                    {" · "}
                    <Link href="/lab/compare" className="underline underline-offset-2">
                      Open comparison
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}

            <ResultHero run={run} />

            <div role="tablist" aria-label="Result sections" className="flex gap-1 border-b border-hairline">
              {(
                [
                  ["overview", "Overview"],
                  ["validation", "Validation"],
                  ["trades", `Trades (${run.result.trades.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-sm transition-colors", tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              <div className="space-y-5">
                <EquityPanel run={run} />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <VerdictPanel run={run} />
                  <Panel>
                    <PanelHeader title="Metrics" description="Strategy against its benchmarks under identical costs." />
                    <PanelBody className="px-0 pt-0">
                      <MetricsTable
                        timeframe={run.config.timeframe}
                        columns={[
                          { name: "Strategy", metrics: run.result.metrics, color: "var(--series-1)" },
                          { name: "Buy & hold", metrics: run.benchmarks.buyAndHold.metrics },
                          { name: "Momentum", metrics: run.benchmarks.momentum.metrics },
                        ]}
                        compactRows={["totalReturnPct", "cagrPct", "maxDrawdownPct", "sharpe", "sortino", "tradeCount", "winRatePct", "profitFactor", "exposurePct", "totalFees"]}
                      />
                      <div className="px-4 pt-3">
                        <WarningsList result={run.result} />
                      </div>
                    </PanelBody>
                  </Panel>
                </div>
                <Panel>
                  <PanelHeader title="How it works" description={STRATEGY_LIBRARY[run.config.params.kind].name} />
                  <PanelBody className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-ink-2 leading-5">{STRATEGY_LIBRARY[run.config.params.kind].explanation}</p>
                      <dl className="mt-3 space-y-1.5 text-xs">
                        <div className="flex gap-2">
                          <dt className="w-10 shrink-0 text-ink-3">Entry</dt>
                          <dd className="text-ink-2">{STRATEGY_LIBRARY[run.config.params.kind].entryRule}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-10 shrink-0 text-ink-3">Exit</dt>
                          <dd className="text-ink-2">{STRATEGY_LIBRARY[run.config.params.kind].exitRule}</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-ink-2">Known weaknesses</h3>
                      <ul className="mt-1.5 space-y-1.5">
                        {STRATEGY_LIBRARY[run.config.params.kind].weaknesses.map((w) => (
                          <li key={w} className="flex gap-2 text-xs text-ink-2 leading-4">
                            <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-warn" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </PanelBody>
                </Panel>
              </div>
            ) : null}

            {tab === "validation" ? (
              <div className="space-y-5">
                {validation.state.status === "running" ? (
                  <Panel>
                    <PanelBody className="flex items-center gap-3 text-sm text-ink-2">
                      <span className="size-2 rounded-full bg-annot animate-pulse" aria-hidden />
                      Running walk-forward and sensitivity analysis in the background… this runs about a hundred backtests.
                    </PanelBody>
                  </Panel>
                ) : null}
                {validation.state.status === "error" ? <ErrorState title="Validation failed" body={validation.state.error} /> : null}
                {run.validation?.walkForward ? <WalkForwardPanel report={run.validation.walkForward} config={run.config} /> : null}
                {run.validation ? <SensitivityPanel reports={run.validation.sensitivity} /> : null}
                {!run.validation && validation.state.status !== "running" ? (
                  <Panel>
                    <PanelHeader title="Out-of-sample testing" />
                    <PanelBody>
                      <p className="max-w-[60ch] text-sm text-ink-2 leading-5">
                        A backtest on the same data you chose the parameters on is a description of the past, not a forecast. Walk-forward testing re-chooses parameters on each training window and trades them on the window after it. Parameter sensitivity shows whether the result survives small changes to your settings.
                      </p>
                      <Button className="mt-4" variant="primary" onClick={startValidation} disabled={run.config.params.kind === "buy_and_hold" || run.config.params.kind === "random_baseline"}>
                        Run full validation
                      </Button>
                    </PanelBody>
                  </Panel>
                ) : null}
                <Panel>
                  <PanelHeader title="Performance by market regime" description="Regimes are classified from trailing trend and volatility, so the strategy could have known them at the time." />
                  <RegimeTable regimes={run.regimes} />
                </Panel>
              </div>
            ) : null}

            {tab === "trades" ? (
              <Panel>
                <PanelHeader title="Trades" description="Most recent first. Fills at the next bar's open, after slippage and fees." />
                <TradesTable result={run.result} />
              </Panel>
            ) : null}
          </div>
        ) : null}
      </div>

      {saveOpen && run ? <SaveDialog run={run} onClose={() => setSaveOpen(false)} onSaved={() => { setSaveOpen(false); share.flash("Saved to the research journal"); }} /> : null}
      {paperOpen && run && series ? <PaperDialog run={run} latest={series[0].candles[series[0].candles.length - 1].time} onClose={() => setPaperOpen(false)} /> : null}
    </div>
  );
}

function LoadingResults() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading market data">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function useShare(run: LabRun | null) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const href = useMemo(() => {
    if (!run) return null;
    try {
      return encodeSnapshot({ v: 1, config: run.config, start: run.result.period.start, end: run.result.period.end, data: run.result.source.version, title: run.config.name });
    } catch {
      return null;
    }
  }, [run]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);
  const copy = useCallback(async () => {
    if (!href) return;
    const url = `${window.location.origin}/s/${href}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage("Link copied. Anyone who opens it re-runs this exact experiment on the same dataset version.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage(url);
    }
  }, [href]);
  return { href, copy, copied, message, flash: setMessage };
}

/* ------------------------------------------------------------------------- */

function SaveDialog({ run, onClose, onSaved }: { run: LabRun; onClose: () => void; onSaved: () => void }) {
  const { items } = useRepository(selectExperiments);
  const [hypothesis, setHypothesis] = useState("");
  const [findings, setFindings] = useState(() => suggestedFindings(run));
  const [weaknesses, setWeaknesses] = useState(() => suggestedWeaknesses(run));
  const previous = useMemo(() => (items ?? []).filter((e) => sameLineage(e.config, run.config)).sort((a, b) => b.version - a.version)[0] ?? null, [items, run.config]);
  const [asVersion, setAsVersion] = useState(true);

  const save = async () => {
    const exp = experimentFromRun(run, {
      hypothesis,
      findings,
      weaknesses,
      lineageId: previous && asVersion ? previous.lineageId : undefined,
      version: previous && asVersion ? previous.version + 1 : 1,
    });
    await getStore().experiments.put(exp);
    onSaved();
  };

  return (
    <Dialog title="Save to research journal" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Hypothesis" hint="What did you expect, and why? Future you will want to know." htmlFor="hyp">
          <Textarea id="hyp" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} maxLength={2000} placeholder="e.g. A slower crossover should trade less and give back less in chop." />
        </Field>
        <Field label="Findings" htmlFor="find">
          <Textarea id="find" value={findings} onChange={(e) => setFindings(e.target.value)} maxLength={5000} />
        </Field>
        <Field label="Weaknesses" htmlFor="weak">
          <Textarea id="weak" value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} maxLength={5000} />
        </Field>
        {previous ? (
          <label className="flex items-start gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={asVersion} onChange={(e) => setAsVersion(e.target.checked)} className="mt-0.5" />
            <span>
              Save as version {previous.version + 1} of <span className="text-ink">{previous.name}</span> so the journal can compare versions.
            </span>
          </label>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save experiment
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PaperDialog({ run, latest, onClose }: { run: LabRun; latest: number; onClose: () => void }) {
  const router = useRouter();
  const { put } = useRepository(selectPortfolios);
  const [capital, setCapital] = useState(run.config.initialCapital);
  const start = async () => {
    // Paper trading begins at the end of the backtest period, so what you tested is history and what follows is "forward".
    const startedAt = Math.min(run.result.period.end, latest - 1);
    const portfolio: PaperPortfolio = {
      id: newId("pp"),
      name: run.config.name,
      config: { ...run.config, initialCapital: capital },
      startedAt,
      clock: startedAt,
      status: "running",
      stoppedAt: null,
      createdAt: Date.now(),
      dataVersion: run.result.source.version,
    };
    await put(portfolio);
    router.push(`/paper?id=${portfolio.id}`);
  };
  return (
    <Dialog title="Start paper trading" onClose={onClose}>
      <p className="text-sm text-ink-2 leading-5">
        A simulated portfolio will follow <span className="text-ink">{run.config.name}</span> forward from the end of your test period. Every position is simulated; no orders are placed anywhere.
      </p>
      <div className="mt-4">
        <Field label="Virtual capital" htmlFor="cap">
          <input id="cap" type="number" min={100} max={10_000_000} step={100} value={capital} onChange={(e) => setCapital(Math.max(100, Number(e.target.value) || 100))} className="num h-9 w-full rounded-[var(--radius-md)] border border-border bg-raised px-2.5 text-sm text-ink" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={start}>
          Start simulated portfolio
        </Button>
      </div>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="w-full max-w-lg rounded-t-[var(--radius-md)] border border-border bg-panel p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:rounded-[var(--radius-md)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 id="dlg-title" className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
