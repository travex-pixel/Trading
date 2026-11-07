# Product

<!-- impeccable:product-schema 1 -->

> Provenance: this record was written from the founder's build brief (7 Nov 2026) in an unattended session. Facts marked **[inferred]** were not confirmed by the user and should be challenged. Everything else is quoted or paraphrased from the brief.

## Platform

web

## Stack

delegated: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, lightweight-charts, Zod. The brief named this stack and asked for Vercel deployment with no paid infrastructure and no credentials required for the demo. Persistence is local-first (browser storage) with Supabase as an optional, env-gated provider.

## Users

Primary user: a technically curious retail trader or developer who wants to know whether a trading idea is real before risking money. They sit at a desk with a laptop and a phone, often in the evening, moving between a 390px phone screen and a desktop monitor. Their job is to turn a vague hunch ("buy when RSI is low") into a tested, documented, comparable experiment, and to learn why most ideas fail.

Secondary audience: the user's friends, who are invited to beat a strategy in a competition and who may never have backtested anything. **[inferred]** They arrive through a shared link and must understand a leaderboard in seconds.

## Product Purpose

EdgeLab is a quantitative trading research and strategy competition platform. It lets a user discover a strategy, understand how it works, configure it, test it on historical data, compare it with alternatives, understand its weaknesses, paper-trade it, monitor it, challenge friends, and keep a record of every experiment.

The core problem it solves: most people cannot distinguish a genuinely effective strategy from one that was lucky, overfitted, only works in backtests, dies after fees, or only works in one market regime. Success means a user can make those distinctions themselves and can show a sceptical friend a result that survives scrutiny.

Version one is research and simulation only. No real-money execution, no wallets, no private keys, no broker integrations.

## Positioning

Tagline: "Find an edge. Prove it. Beat the market."

The mechanism a neighbouring product cannot truthfully copy: every result in EdgeLab carries its evidence. Metrics are never shown alone; they are shown against benchmarks (buy and hold, cash, simple momentum), split into in-sample and out-of-sample periods, stress-tested across regimes and parameter neighbourhoods, and accompanied by plain-English warnings about sample size and overfitting. A strategy with the highest return is never automatically the winner.

Competitors in spirit: Botfight (accessible competition), Zenith (structured AI and real-time architecture), StoicTradingAI (transparent execution and risk), ECC (research-first workflow). EdgeLab borrows their concepts, not their interfaces.

## Operating Context

- Five primary experiences: Command Centre (home), Strategy Lab (build, test, compare), Bot Arena (competition and leaderboard), Trade Replay (bar-by-bar simulation with explanations), Research Journal (experiment history and versions).
- Paper trading runs on a deterministic simulation engine and every position is labelled simulated.
- Market data: cryptocurrency first (BTC and ETH), designed so equities can be added later. A deterministic demo dataset ships with the product and is labelled "DEMO DATA — NOT LIVE MARKET DATA" wherever it appears. Live providers are optional and configured server-side.
- The AI research assistant explains, suggests, reviews and challenges. It never invents data or performance figures, always cites the dataset and period, and labels AI-generated strategies as hypotheses.
- Development follows research → plan → design → build → test → review → improve → verify.

## Capabilities and Constraints

Confirmed capabilities for version one:
- Strategy library: moving-average crossover, RSI mean reversion, MACD momentum, breakout, trend following, volatility breakout, buy-and-hold benchmark, simple momentum rotation, plus a random baseline for the Arena.
- Guided strategy builder with structured controls only (asset, timeframe, entry indicator and threshold, exit, stop loss, take profit, position sizing, transaction costs). No user-authored executable code, ever.
- Bar-by-bar backtesting with fees, slippage, position sizing, cash balance, next-bar execution, stops and take-profits, position limits, and no look-ahead.
- Validation: train/validation/test split, walk-forward, parameter sensitivity, regime breakdown, minimum trade counts and sample-size warnings.
- Side-by-side comparison with overlaid equity curves and plain-English trade-offs.
- Competitions with identical capital, dates, assets, costs and execution assumptions; shareable links; seeded demo participants that are labelled as such.
- Research journal recording hypothesis, parameters, dataset, period, results, benchmark, findings, weaknesses, date and version.

Hard constraints:
- No private keys, seed phrases, withdrawal permissions, real-money transactions, automated execution, browser credential collection, AI-initiated shell execution, unreviewed MCP servers, remote code execution, committed secrets, browser-exposed API keys, or hidden telemetry.
- The demo must run with zero credentials. Supabase and any AI provider are optional.
- Mobile-first at 390 × 844; must also be excellent on desktop. The mobile experience is not a squashed dashboard.
- Quantitative correctness beats visual appeal. Annualised figures and Sharpe ratios are not shown when the data is insufficient; the limitation is shown instead.

Terminology the product uses with users: "edge", "experiment", "backtest", "out-of-sample", "drawdown" (explained as "the biggest fall from a previous high"), "paper trading" (always "simulated"). Advanced terms are introduced progressively.

Undecided (recorded, not invented): authentication provider and genuine multiplayer timing; which live market-data provider becomes the default; pricing or any commercial terms.

## Brand Commitments

Name: EdgeLab. Tagline as above. Voice: short, direct, intelligent; plain English before jargon ("Is your strategy making money for the amount of risk it takes?" rather than "annualised risk-adjusted performance").

Binding visual constraints the founder set: a deep charcoal / near-black foundation, warm off-white typography, muted neutral surfaces, restrained emerald for positive performance and restrained red for negative, subtle borders, excellent typography, high-quality financial charts, precise spacing, strong hierarchy. Explicitly refused: purple gradients, neon glow, glassmorphism, excessive rounded cards, emoji navigation, giant empty heroes, decorative animation, generic AI copy, fake live numbers. The product should feel like a serious research tool, not a casino, and sit credibly beside Linear, Stripe, Vercel and Superhuman.

## Evidence on Hand

- No real customers, testimonials, press or case studies exist. Nothing of that kind may be fabricated.
- No live market data is available in the build environment; all shipped data is deterministic synthetic demo data and is labelled as such.
- Reference material: Impeccable (design), Vercel agent skills (React/Next performance, composition, deployment, web interface guidelines), ECC (workflow concepts only), Zenith and StoicTradingAI (concepts only; nothing imported or executed).

## Product Principles

1. Evidence over excitement: every number earns its place and carries its benchmark, period and caveat.
2. No look-ahead, no fake data, no pretend users: honesty is the product's moat.
3. Plain English first, quantitative depth on demand.
4. Simulation only in version one; the architecture leaves room for real multiplayer and live data, never for real-money execution.
5. The smallest complete product, polished relentlessly, rather than a wide shallow one.

## Accessibility & Inclusion

WCAG AA contrast, full keyboard navigation, no colour-only meaning for profit and loss (sign and label always accompany colour), readable at 390px and on an ordinary phone.
