"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ANALYST_LABELS, aiReviewSchema, type AIReview, type SuggestedExperiment } from "@/lib/ai/schema";
import type { LabRun } from "@/lib/lab/run";
import type { StrategyConfig, StrategyParams } from "@/lib/strategies/schema";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function applyExperiment(config: StrategyConfig, exp: SuggestedExperiment): StrategyConfig {
  let next: StrategyConfig = { ...config };
  if (exp.paramPatch) {
    const allowed = new Set(Object.keys(config.params));
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(exp.paramPatch)) if (allowed.has(k) && k !== "kind") patch[k] = v;
    next = { ...next, params: { ...config.params, ...patch } as StrategyParams };
  }
  if (exp.riskPatch) {
    next = {
      ...next,
      risk: {
        ...next.risk,
        ...(exp.riskPatch.stopLossPct !== undefined ? { stopLossPct: exp.riskPatch.stopLossPct } : {}),
        ...(exp.riskPatch.takeProfitPct !== undefined ? { takeProfitPct: exp.riskPatch.takeProfitPct } : {}),
      },
    };
  }
  if (exp.timeframe) next = { ...next, timeframe: exp.timeframe };
  return next;
}

export function AssistantPanel({ run, onApply }: { run: LabRun; onApply: (config: StrategyConfig) => void }) {
  const [review, setReview] = useState<AIReview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const reviewedId = useRef<string | null>(null);

  const request = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: run.config, period: { start: run.result.period.start, end: run.result.period.end }, validate: Boolean(run.validation) }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg = (json as { error?: string }).error ?? `Request failed (${res.status}).`;
        throw new Error(msg);
      }
      const payload = json as { review: unknown; note: string | null; llmConfigured: boolean };
      const parsed = aiReviewSchema.safeParse(payload.review);
      if (!parsed.success) throw new Error("The assistant's answer failed validation and was discarded.");
      setReview(parsed.data);
      setNote(payload.note);
      setLlmConfigured(payload.llmConfigured);
      reviewedId.current = run.result.id + (run.validation ? ":v" : "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The assistant is unavailable.");
    }
  }, [run]);

  // Mark stale when the run changes.
  useEffect(() => {
    if (reviewedId.current && reviewedId.current !== run.result.id + (run.validation ? ":v" : "")) {
      setReview(null);
      reviewedId.current = null;
    }
  }, [run]);

  return (
    <Panel>
      <PanelHeader
        title="Research assistant"
        description={
          llmConfigured === false
            ? "Rule-based analysts. Add a server-side ANTHROPIC_API_KEY to enable Claude's review on top."
            : llmConfigured
              ? "Deterministic analysts, reviewed by Claude. Every number is recomputed on the server."
              : "Five analysts read the result and argue about it. Evidence is separated from speculation."
        }
        aside={
          <Button size="sm" variant={review ? "secondary" : "primary"} onClick={request} disabled={status === "loading"}>
            <Sparkle className="size-3.5" aria-hidden />
            {status === "loading" ? "Reviewing…" : review ? "Review again" : "Review this result"}
          </Button>
        }
      />
      <PanelBody>
        {status === "error" ? <ErrorState title="Review unavailable" body={error} /> : null}
        {!review && status !== "error" ? (
          <p className="max-w-[60ch] text-sm text-ink-2 leading-5">
            The assistant explains the result, flags possible overfitting, compares it with the benchmarks and proposes the next small experiment. It never invents figures: the server re-runs your configuration and the assistant may only quote what it finds.
          </p>
        ) : null}
        {review ? (
          <div className="space-y-5">
            <p className="text-sm text-ink leading-5">{review.summary}</p>
            <div className="flex flex-wrap items-center gap-2 text-2xs">
              <Badge tone={review.provenance.mode === "claude" ? "annot" : "muted"}>{review.provenance.mode === "claude" ? `Claude · ${review.provenance.model ?? ""}` : "Rule-based"}</Badge>
              <Badge tone={review.confidence === "high" ? "up" : review.confidence === "moderate" ? "annot" : review.confidence === "low" ? "warn" : "down"}>Confidence: {review.confidence}</Badge>
              <span className="num text-ink-3">
                {review.provenance.dataset} · {fmtDate(review.provenance.period.start)} – {fmtDate(review.provenance.period.end)}
              </span>
            </div>
            {note ? <p className="text-xs text-warn">{note}</p> : null}

            <div className="grid gap-4 md:grid-cols-2">
              {review.analysts.map((a) => (
                <section key={a.role} className="border-t border-hairline pt-3">
                  <h3 className="text-sm font-medium text-ink">{ANALYST_LABELS[a.role].title}</h3>
                  <p className="text-2xs text-ink-3">{ANALYST_LABELS[a.role].job}</p>
                  <ul className="mt-2 space-y-1.5">
                    {a.statements.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-[1.15rem] text-ink-2">
                        <span className={cn("mt-0.5 shrink-0 rounded-[2px] px-1 font-mono text-[9px] uppercase tracking-wider leading-4", s.kind === "evidence" ? "bg-up-dim text-up" : "bg-annot-dim text-annot")}>{s.kind === "evidence" ? "data" : "view"}</span>
                        {s.text}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {review.experiments.length ? (
              <section className="border-t border-hairline pt-3">
                <h3 className="text-sm font-medium text-ink">Suggested next experiments</h3>
                <p className="text-2xs text-ink-3">Hypotheses, not recommendations. Each applies one change to the builder.</p>
                <ul className="mt-2 divide-y divide-hairline">
                  {review.experiments.map((e, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm text-ink">{e.title}</div>
                        <p className="mt-0.5 text-xs text-ink-2 leading-4">{e.rationale}</p>
                      </div>
                      <Button size="sm" onClick={() => onApply(applyExperiment(run.config, e))}>
                        Try it
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="border-t border-hairline pt-3">
              <h3 className="text-xs font-medium text-ink-2">Limitations</h3>
              <ul className="mt-1.5 space-y-1">
                {review.limitations.map((l, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-3 leading-4">
                    <span aria-hidden className="mt-[6px] size-1 shrink-0 rounded-full bg-current" />
                    {l}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
