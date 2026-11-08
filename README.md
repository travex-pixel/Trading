# EdgeLab

**Find an edge. Prove it. Beat the market.**

EdgeLab is a quantitative trading research and strategy competition platform. Configure a strategy without writing code, backtest it honestly (next-bar fills, fees, slippage, no look-ahead), compare it with benchmarks, stress-test it with walk-forward and sensitivity analysis, replay it bar by bar, paper-trade it, challenge friends, and keep a research journal.

Version one is **research and simulation only**. There is no real-money execution, no wallet, no broker connection, and nothing in the product can place an order anywhere.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No credentials are needed: the app ships with a deterministic synthetic dataset labelled **DEMO DATA — NOT LIVE MARKET DATA** everywhere it appears.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Next.js type generation + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (engine, indicators, metrics, validation, demo data, analysts) |
| `npm run test:e2e` | Playwright end-to-end journey (builds and starts the app on port 3100) |
| `npm run check` | typecheck + lint + unit tests |

## Environment variables

Everything is optional. See `.env.example`.

| Variable | Scope | Effect |
|---|---|---|
| `MARKET_DATA_PROVIDER` | server | `demo` (default) or `coinbase` (Coinbase Exchange public candles, no key). Falls back to demo with a visible label if the provider fails. |
| `ANTHROPIC_API_KEY` | server | Enables Claude's review in the research assistant on top of the deterministic analysts. Without it the assistant is fully rule-based. |
| `ANTHROPIC_MODEL` | server | Model for the review. Default `claude-opus-5-5`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Reserved for the optional Supabase persistence layer (see `supabase/schema.sql`). Not wired in version one; data is browser-local. |

No variable is ever read in client code except the two `NEXT_PUBLIC_` ones, which are designed to be public.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New Project** → import the repository. Framework preset: Next.js. Build command `npm run build`, output default. Node 20 or later.
3. Add environment variables only if you want them (none are required). Preview deployments work with zero configuration.
4. Deploy. Security headers (CSP, frame-ancestors, nosniff, referrer and permissions policies) are set in `next.config.ts` and apply to every route.

Every push to a branch creates a preview deployment; merging to `main` deploys production. Nothing in the app incurs paid infrastructure.

## What is where

- `PRODUCT.md` — product truth: users, purpose, positioning, constraints.
- `ARCHITECTURE.md` — layers, key decisions, data flow, how to extend.
- `SECURITY.md` — controls, dependency audit log, tooling review, release checklist.
- `DESIGN.md` — the visual system as built.
- `src/lib/quant` — the engine. Start with `backtest.ts` and `metrics.ts`.
- `src/lib/strategies` — the ten strategy definitions as validated data.
- `src/lib/market` — demo data generator and provider switch.
- `src/app` — routes: `/` Command Centre, `/lab` Strategy Lab, `/arena` Bot Arena, `/replay` Trade Replay, `/journal` Research Journal, `/paper` Paper Trading, `/s/[code]` shared experiments.

## Honesty notes

- The demo dataset is a seeded random process with regimes, volatility clustering and jumps. It is useful for learning the method and comparing strategies under identical conditions. **A result on it is not a tradable edge.**
- Annualised return is hidden for periods under 180 days; Sharpe and Sortino are hidden with fewer than 30 bars or zero variance; trade statistics are flagged below 30 trades.
- Shared links contain the configuration and period, not results. The recipient's browser recomputes everything on the same dataset version.
- Seeded Arena participants are bots and are labelled as bots.
