/**
 * Deterministic analysts. Each reads the Lab run and writes statements tagged
 * as evidence (computed from the data) or speculation (an interpretation).
 * No external calls, no invented numbers: every figure quoted here is read
 * from the run.
 */

import type { LabRun } from "@/lib/lab/run";
import { MIN_TRADES_FOR_CONFIDENCE } from "@/lib/quant/metrics";
import { REGIME_LABELS, tunableParams } from "@/lib/quant/validation";
import { STRATEGY_LIBRARY } from "@/lib/strategies/library";
import type { AIReview, AnalystRole, SuggestedExperiment } from "./schema";

type Statement = AIReview["analysts"][number]["statements"][number];

const pct = (v: number | null | undefined, sign = true) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(2));
const ev = (text: string): Statement => ({ kind: "evidence", text });
const sp = (text: string): Statement => ({ kind: "speculation", text });

export function researchAnalyst(run: LabRun): Statement[] {
  const out: Statement[] = [];
  const m = run.result.metrics;
  const kind = run.config.params.kind;
  const sens = run.validation?.sensitivity ?? [];
  const fragile = sens.filter((s) => s.stability < 0.5);
  if (fragile.length) {
    out.push(ev(`Sensitivity analysis found ${fragile.map((f) => f.param.key).join(" and ")} fragile: fewer than half of nearby values keep half the performance.`));
    out.push(sp(`A hypothesis worth testing: a coarser version of ${fragile[0].param.key} (fewer distinct settings) that trades the peak for a plateau.`));
  }
  if (m.tradeCount > 0 && m.tradeCount < MIN_TRADES_FOR_CONFIDENCE) {
    out.push(sp(`With ${m.tradeCount} trades the sample is thin. Testing the same rule on the ${run.config.timeframe === "1d" ? "4h" : "1h"} timeframe would multiply the trade count and show whether the idea or the sample is doing the work.`));
  }
  if (m.exposurePct < 35) {
    out.push(sp(`The strategy was invested only ${pct(m.exposurePct, false)} of the time. If the edge is real, a less selective entry might capture more of it. If it is not, more exposure will show that quickly.`));
  }
  if (kind === "ma_crossover" || kind === "macd_momentum" || kind === "tsmom") {
    out.push(sp("Trend rules of this family usually improve when a volatility filter keeps them out of quiet chop. That is a hypothesis to test, not a result."));
  }
  if (kind === "rsi_mean_reversion" || kind === "volatility_breakout") {
    out.push(sp("Mean-reversion and spike rules depend heavily on the exit. Testing a time-based exit against the current one would show whether the entry or the exit carries the result."));
  }
  if (out.length === 0) out.push(sp("No obvious next hypothesis stands out from the data alone. Testing the same configuration on the other asset is the cheapest independent check."));
  return out.slice(0, 5);
}

export function technicalAnalyst(run: LabRun): Statement[] {
  const out: Statement[] = [];
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const regimes = run.regimes;
  const up = regimes.find((r) => r.regime === "uptrend");
  const down = regimes.find((r) => r.regime === "downtrend");
  const side = regimes.find((r) => r.regime === "sideways");
  if (up) out.push(ev(`In uptrends (${pct(up.sharePct, false)} of the period) the strategy returned ${pct(up.strategyReturnPct)} against ${pct(up.marketReturnPct)} for the market, invested ${pct(up.exposurePct, false)} of the time.`));
  if (down) out.push(ev(`In downtrends (${pct(down.sharePct, false)} of the period) it returned ${pct(down.strategyReturnPct)} while the market fell ${pct(down.marketReturnPct)}.`));
  if (side) out.push(ev(`In sideways markets (${pct(side.sharePct, false)}) it returned ${pct(side.strategyReturnPct)} versus ${pct(side.marketReturnPct)} for the market.`));
  if (m.avgHoldingBars !== null) {
    const tf = run.config.timeframe;
    const hours = m.avgHoldingBars * (tf === "1h" ? 1 : tf === "4h" ? 4 : 24);
    out.push(ev(`The average position lasted ${hours < 48 ? `${Math.round(hours)} hours` : `${(hours / 24).toFixed(1)} days`} across ${m.tradeCount} trades.`));
  }
  if (down && down.strategyReturnPct > down.marketReturnPct + 5) out.push(sp("Most of the value over buy and hold appears to come from stepping aside in downtrends rather than from catching more upside."));
  else if (m.totalReturnPct > b.totalReturnPct && up && up.exposurePct > 80) out.push(sp("The strategy rode uptrends almost fully invested, so its edge over buy and hold rests on what it did outside them."));
  return out.slice(0, 5);
}

export function quantResearcher(run: LabRun): Statement[] {
  const out: Statement[] = [];
  const m = run.result.metrics;
  const wf = run.validation?.walkForward ?? null;
  const days = Math.round((run.result.period.end - run.result.period.start) / 86_400_000);
  out.push(ev(`The test covers ${days} days on ${run.result.source.isSynthetic ? "the synthetic demo dataset" : run.result.source.label} (version ${run.result.source.version}) at ${run.config.timeframe} bars, with ${m.tradeCount} completed trades.`));
  if (m.sharpe !== null) out.push(ev(`Sharpe ${num(m.sharpe)} and Sortino ${num(m.sortino)}. Buy and hold scored a Sharpe of ${num(run.benchmarks.buyAndHold.metrics.sharpe)}.`));
  else out.push(ev("Sharpe is not estimable for this period, so risk-adjusted comparisons are not available."));
  if (wf && wf.folds.length) {
    const positive = wf.folds.filter((f) => f.testMetrics.totalReturnPct > 0).length;
    out.push(ev(`Walk-forward: ${positive} of ${wf.folds.length} out-of-sample windows were profitable. Stitched out-of-sample Sharpe was ${num(wf.stitchedMetrics.sharpe)} against ${num(wf.inSampleMetrics.sharpe)} in sample.`));
    if (wf.stitchedMetrics.sharpe !== null && wf.inSampleMetrics.sharpe !== null && wf.inSampleMetrics.sharpe > 0) {
      const deg = 1 - wf.stitchedMetrics.sharpe / wf.inSampleMetrics.sharpe;
      out.push(deg > 0.5 ? sp("A degradation this large usually means the chosen parameters fit the past rather than a persistent effect.") : sp("The out-of-sample result holding up is the strongest single piece of evidence here, though one dataset is still one dataset."));
    }
  } else {
    out.push(sp("Without a walk-forward test, nothing distinguishes a real effect from parameters chosen to fit this exact history."));
  }
  if (run.result.source.isSynthetic) out.push(ev("The demo dataset is a seeded random process. A result here demonstrates the method, not a tradable edge."));
  return out.slice(0, 5);
}

export function riskAnalyst(run: LabRun): Statement[] {
  const out: Statement[] = [];
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  out.push(ev(`Maximum drawdown ${pct(-m.maxDrawdownPct)} versus ${pct(-b.maxDrawdownPct)} for buy and hold. The worst losing streak was ${m.maxConsecutiveLosses} trades in a row.`));
  const feeShare = (m.totalFees / run.result.assumptions.initialCapital) * 100;
  out.push(ev(`Fees and slippage consumed ${pct(feeShare, false)} of starting capital (${run.result.assumptions.feeBps} bp fee and ${run.result.assumptions.slippageBps} bp slippage per side).`));
  if (m.maxDrawdownPct > 40) out.push(sp(`A ${Math.round(m.maxDrawdownPct)}% fall is the kind most people abandon halfway through. Ask whether you would have kept following the rules at the bottom.`));
  if (m.maxConsecutiveLosses >= 6) out.push(sp(`${m.maxConsecutiveLosses} consecutive losses is a realistic stretch for this rule. Position sizing that survives it matters more than the entry.`));
  if (feeShare > 10) out.push(sp("Costs this high make the result hostage to the fee assumption. Halving trade frequency is a cheaper fix than finding a better signal."));
  if (run.config.risk.stopLossPct === null && m.maxDrawdownPct > b.maxDrawdownPct * 0.8) out.push(sp("There is no stop loss. Adding one usually trades a slightly lower return for a materially shallower worst case. You can test that trade-off here."));
  return out.slice(0, 5);
}

export function independentReviewer(run: LabRun): Statement[] {
  const out: Statement[] = [];
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const mom = run.benchmarks.momentum.metrics;
  if (m.totalReturnPct > b.totalReturnPct) {
    out.push(sp("The strategy beat buy and hold over this window. Shift the start date by a few months and check whether the ranking survives. Many 'edges' turn out to be a start-date artefact."));
  } else {
    out.push(ev(`Buy and hold returned ${pct(b.totalReturnPct)} and this strategy ${pct(m.totalReturnPct)}. The burden of proof is on the strategy, and it has not met it here.`));
  }
  if (mom.totalReturnPct > m.totalReturnPct && (mom.sharpe ?? -1) > (m.sharpe ?? -1)) {
    out.push(ev(`The one-line momentum benchmark (${pct(mom.totalReturnPct)}, Sharpe ${num(mom.sharpe)}) beat this strategy. Added complexity is not paying for itself.`));
  }
  const tunable = tunableParams(run.config.params).length;
  if (tunable >= 2) out.push(sp(`With ${tunable} tunable parameters, the number of configurations that could have been tried is large. The honest question is how many you tried before this one.`));
  if (m.tradeCount < MIN_TRADES_FOR_CONFIDENCE) out.push(ev(`Fewer than ${MIN_TRADES_FOR_CONFIDENCE} trades. Statistically, this result cannot be distinguished from luck.`));
  const weak = STRATEGY_LIBRARY[run.config.params.kind].weaknesses[0];
  out.push(sp(`Known weakness of this family: ${weak}`));
  return out.slice(0, 5);
}

export function suggestExperiments(run: LabRun): SuggestedExperiment[] {
  const out: SuggestedExperiment[] = [];
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const params = tunableParams(run.config.params);
  const sens = run.validation?.sensitivity ?? [];

  for (const s of sens.filter((x) => x.stability < 0.5).slice(0, 2)) {
    const best = s.points.filter((p) => p.metrics && p.value !== s.param.value).sort((a, c) => (c.metrics!.sharpe ?? -9) - (a.metrics!.sharpe ?? -9))[0];
    if (best) {
      out.push({
        title: `Move ${s.param.key} from ${s.param.value} to ${best.value}`,
        rationale: `Nearby values perform very differently. ${best.value} scored best among the neighbours. Check whether that result is a plateau or just another spike.`,
        paramPatch: { [s.param.key]: best.value },
      });
    }
  }
  if (m.tradeCount < MIN_TRADES_FOR_CONFIDENCE && run.config.timeframe !== "1h") {
    out.push({ title: `Re-test on ${run.config.timeframe === "1d" ? "4h" : "1h"} bars`, rationale: "More bars means more trades and a larger sample for the same idea.", timeframe: run.config.timeframe === "1d" ? "4h" : "1h" });
  }
  if (run.config.risk.stopLossPct === null && m.maxDrawdownPct > 30 && run.config.params.kind !== "buy_and_hold") {
    out.push({ title: "Add a 10% stop loss", rationale: "Tests whether capping the worst trade reduces the drawdown more than it costs in return.", riskPatch: { stopLossPct: 0.1 } });
  }
  if (run.config.risk.stopLossPct !== null && m.winRatePct !== null && m.winRatePct < 35) {
    out.push({ title: "Loosen or remove the stop loss", rationale: "A low win rate with a stop often means the stop is converting normal noise into realised losses.", riskPatch: { stopLossPct: null } });
  }
  if (m.totalFees > 0.1 * run.result.assumptions.initialCapital && params.length) {
    const p = params[0];
    out.push({ title: `Slow down: ${p.key} ${p.value} → ${Math.round(p.value * 1.5)}`, rationale: "Costs are a large share of the result. A slower setting trades less and pays less.", paramPatch: { [p.key]: Math.min(p.max, Math.round(p.value * 1.5)) } });
  }
  if (m.totalReturnPct < b.totalReturnPct && m.exposurePct < 60 && params.length && out.length < 4) {
    const p = params[0];
    out.push({ title: `Faster entry: ${p.key} ${p.value} → ${Math.max(p.min, Math.round(p.value * 0.7))}`, rationale: "Low exposure and underperformance suggest the rule enters too late or too rarely.", paramPatch: { [p.key]: Math.max(p.min, Math.round(p.value * 0.7)) } });
  }
  return out.slice(0, 5);
}

export function ruleBasedReview(run: LabRun): AIReview {
  const roles: Array<[AnalystRole, Statement[]]> = [
    ["quant", quantResearcher(run)],
    ["technical", technicalAnalyst(run)],
    ["risk", riskAnalyst(run)],
    ["research", researchAnalyst(run)],
    ["reviewer", independentReviewer(run)],
  ];
  const verdict = run.assessment.verdict;
  const confidence: AIReview["confidence"] = verdict === "robust" ? "moderate" : verdict === "promising" ? "low" : "none";
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const summary = [
    `${run.config.name} returned ${pct(m.totalReturnPct)} with a ${pct(-m.maxDrawdownPct, false)} maximum drawdown over ${m.tradeCount} trades. Buy and hold returned ${pct(b.totalReturnPct)} with a ${pct(-b.maxDrawdownPct, false)} drawdown.`,
    run.assessment.headline,
    run.validation ? "Walk-forward and sensitivity results are included below." : "Run the full validation to test for overfitting before drawing conclusions.",
  ].join(" ");
  const limitations = [
    run.result.source.isSynthetic ? "All figures come from the deterministic demo dataset, not live markets." : `Data source: ${run.result.source.label}.`,
    "One asset, one period, one dataset: results describe the past and do not forecast.",
    "Execution assumes fills at the next bar's open with fixed slippage. Real fills vary.",
  ];
  if (!run.validation) limitations.push("No out-of-sample test has been run yet.");
  return {
    summary,
    analysts: roles.map(([role, statements]) => ({ role, statements })),
    limitations,
    experiments: suggestExperiments(run),
    confidence,
    provenance: { mode: "rule_based", model: null, dataset: run.result.source.version, period: run.result.period },
  };
}

/** Compact, number-complete summary of a run for a language model. Every figure the model may quote is here. */
export function runBrief(run: LabRun): string {
  const m = run.result.metrics;
  const b = run.benchmarks.buyAndHold.metrics;
  const lines = [
    `Strategy: ${run.config.name} (${STRATEGY_LIBRARY[run.config.params.kind].name}). Params: ${JSON.stringify(run.config.params)}. Risk: ${JSON.stringify(run.config.risk)}. Costs: ${run.config.costs.feeBps}bp fee, ${run.config.costs.slippageBps}bp slippage.`,
    `Dataset: ${run.result.source.label} version ${run.result.source.version}${run.result.source.isSynthetic ? " (SYNTHETIC)" : ""}. Period ${new Date(run.result.period.start).toISOString().slice(0, 10)} to ${new Date(run.result.period.end).toISOString().slice(0, 10)}, ${run.result.period.bars} bars at ${run.config.timeframe}.`,
    `Strategy metrics: return ${pct(m.totalReturnPct)}, CAGR ${pct(m.cagrPct)}, maxDD ${pct(-m.maxDrawdownPct)}, Sharpe ${num(m.sharpe)}, Sortino ${num(m.sortino)}, trades ${m.tradeCount}, win rate ${pct(m.winRatePct, false)}, profit factor ${num(m.profitFactor)}, exposure ${pct(m.exposurePct, false)}, fees ${m.totalFees.toFixed(0)}, worst streak ${m.maxConsecutiveLosses}.`,
    `Buy and hold: return ${pct(b.totalReturnPct)}, maxDD ${pct(-b.maxDrawdownPct)}, Sharpe ${num(b.sharpe)}. Momentum benchmark: return ${pct(run.benchmarks.momentum.metrics.totalReturnPct)}, Sharpe ${num(run.benchmarks.momentum.metrics.sharpe)}.`,
    `Regimes: ${run.regimes.map((r) => `${REGIME_LABELS[r.regime]} ${pct(r.sharePct, false)} of time, strategy ${pct(r.strategyReturnPct)}, market ${pct(r.marketReturnPct)}`).join("; ")}.`,
    `Verdict: ${run.assessment.verdict}. Findings: ${run.assessment.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`).join(" ")}`,
  ];
  const wf = run.validation?.walkForward;
  if (wf) lines.push(`Walk-forward (${wf.folds.length} folds): in-sample Sharpe ${num(wf.inSampleMetrics.sharpe)}, out-of-sample stitched Sharpe ${num(wf.stitchedMetrics.sharpe)}, OOS return ${pct(wf.stitchedMetrics.totalReturnPct)}, profitable test windows ${wf.folds.filter((f) => f.testMetrics.totalReturnPct > 0).length}.`);
  const sens = run.validation?.sensitivity;
  if (sens?.length) lines.push(`Sensitivity stability: ${sens.map((s) => `${s.param.key} ${(s.stability * 100).toFixed(0)}%`).join(", ")}.`);
  return lines.join("\n");
}
