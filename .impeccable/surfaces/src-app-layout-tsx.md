---
version: 1
slug: "src-app-layout-tsx"
primary_target: "src/app/layout.tsx"
related_targets: ["src/app/page.tsx"]
---

# Surface brief: EdgeLab app shell and five primary screens

Scope: the whole web app (Command Centre, Strategy Lab, Bot Arena, Trade Replay, Research Journal, Paper Trading). Visitor mode: Operate. Audience: a technically curious retail trader/developer proving whether a trading idea is real; friends arriving via shared competition links. Task: configure, backtest, compare, replay, paper-trade, record. Proof/content: deterministic demo data (labelled), real engine output, no invented claims. Constraints: brief-pinned palette (near-black ground, warm off-white type, restrained emerald/red for P&L), mobile-first 390px, no AI-slop patterns, no casino energy.

Grounded candidates (ordered by resonance, operate mode, from the audience's graphic world, not its instruments):
1. Academic finance paper figure (hairline axes, shaded test regions, captions)
2. Laboratory notebook (dated entries, hypothesis/result/conclusion)
3. Sports league table / race card (leaderboard rhythm)
4. Fund factsheet / annual report (monthly-returns grid, tabular restraint)
5. Swiss railway timetable (dense mono columns, strict rhythm)
6. Field guide / Tufte data book (small multiples, marginal notes)
7. Engineering drawing / title block (provenance plate, dimension-line annotations)

Roll: degraded (no challengers, no quality-bar boards). Assigned index 7. Decision page could not be served in an unattended session; proceeded with the assignment and stated assumptions in the first reply.

## Direction contract

THESIS: EdgeLab is the research tool whose every number shows its working. It refuses the category default (a grid of same-size metric cards with a big green number and a sparkline) and instead treats each result like a sheet in an engineering drawing set: measured, annotated, and stamped with its provenance.

OWN-WORLD: Near-black charcoal ground (#0b0c0e family) with slightly lifted panels, warm off-white ink (#ece9e2 family), hairline rules at 1px in a warm grey, a single cool slate-blue annotation colour for selection, focus, dimension lines and callouts, emerald and red reserved strictly for signed performance. Type: Schibsted Grotesk for UI and headings (weights 400–700, tight but legible), Sometype Mono for every figure, ticker, timestamp and table cell that carries a number. Density high and ordered: 8px rhythm, 13px table text, 12px mono meta. Controls are standard web controls (tabs, selects, sliders, tables) styled in this material. With all content removed, the page is recognisable by its hairline grid, mono figures, and the small ruled provenance plates under each chart.

STORY: The visitor understands within five seconds what the market is doing, which of their strategies is strongest and which is deteriorating, and that every figure is backed by a dataset, a period and a benchmark. They believe EdgeLab will not flatter them. They act by creating an experiment, running a backtest, and reading the verdict.

FIRST VIEWPORT (Command Centre, 390px): a slim top bar with the EdgeLab wordmark and a DEMO DATA label; a one-line market strip (BTC and ETH with signed change in mono); then the headline: simulated portfolio value with its signed P&L and a compact equity line annotated with a dimension line for current drawdown; then the strategy leaderboard as a ruled table (rank, name, return, drawdown, risk-adjusted score) with the strongest and the deteriorating strategy flagged in words; then recent experiments; the primary action "New experiment" sits as a fixed bottom-right button above the five-tab bottom navigation. On desktop (1280+): a left rail replaces the tab bar; the equity chart and leaderboard sit side by side above positions and experiments.

FORM: Engineering drawing / title block, position 7 of 7 on the ordered list. seed:e5fad74ce75346ea. Signature move: the provenance plate (a small ruled strip stating dataset · period · fees/slippage · version · verdict) under every chart and result table, and dimension-line annotations on charts marking the in-sample/out-of-sample wall and the maximum drawdown span. Signature interaction: in Trade Replay, stepping bars draws the dimension line for the open trade's P&L live, and each entry/exit drops a numbered callout with the strategy's reason.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
