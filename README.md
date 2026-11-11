# EdgeLab

**Find an edge. Prove it. Beat the market.**

EdgeLab is an ASX-first quantitative trading research and strategy competition platform. Pick an Australian equity or ETF (US equities and crypto are also supported), configure a strategy without writing code, backtest it honestly (next-session fills, brokerage, slippage, no look-ahead), compare it with benchmarks, stress-test it with walk-forward and sensitivity analysis, replay it bar by bar, paper-trade it, challenge friends, and keep a research journal. A daily five-question calibration game ("Today's Five") is built from the same engine.

Version one is **research and simulation only**. There is no real-money execution, no wallet, no broker connection, and nothing in the product can place an order anywhere.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. No credentials are needed: the app ships with a deterministic synthetic dataset labelled **DEMO DATA — NOT LIVE MARKET DATA** everywhere it appears.

## Markets

| Market | Status | Instruments | Currency | Sessions | Default costs |
|---|---|---|---|---|---|
| ASX (primary) | Operational | CBA, BHP, CSL, WES, MQG, NAB, WBC, ANZ, WOW, FMG, TLS, RIO, REA, GMG, XRO, WTC, VAS, A200, STW | AUD | 10:00–16:00 Sydney, ASX holidays closed | A$10 brokerage per order, 5 bp slippage |
| US equities and ETFs | Operational | AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA, JPM, BRK.B, SPY, QQQ | USD | 09:30–16:00 New York, NYSE holidays closed | zero commission, 3 bp slippage |
| Crypto | Operational | BTC, ETH, SOL | USD | 24/7 UTC | 10 bp fee, 5 bp slippage |
| Forex | Not available | | | | |

Trading calendars (Sydney and New York daylight saving, ASX and NYSE public holidays, session hours) live in `src/lib/market/calendar.ts`. The instrument registry and per-market assumptions live in `src/lib/market/instruments.ts`. Annualised metrics use 252 trading days for equities and 365 for crypto. All strategies are long-only, and short selling is stated as not modelled.

## Market data

The engine is provider-independent. `src/lib/market/provider.ts` resolves each instrument through a chain:

1. **EODHD** (eodhd.com) when `EODHD_API_TOKEN` is set: real historical data for ASX (exchange code `AU`), US and crypto. End-of-day bars are split- and dividend-adjusted (`adjusted_close`), intraday bars are unadjusted, quotes are delayed 15–20 minutes. Calls are cached server-side. Every series states its provider, freshness and adjustment.
2. **Coinbase Exchange** public candles for crypto when `MARKET_DATA_PROVIDER=coinbase` (no key).
3. **Demo dataset**: deterministic, synthetic, session-aware, labelled.

Provider research (pages read directly in November 2026): Twelve Data's free Basic tier is "internal non-display usage" only and ASX is a paid data add-on on a paid plan, so it was not selected. Alpaca covers US stocks, ETFs and crypto only, not the ASX. EODHD covers ASX end-of-day history on its lowest paid tier (free tier: 20 calls per day on a limited symbol set) and intraday for AU on the Extended tier. No subscription has been purchased. Connecting a provider is your decision.

The Markets page shows which provider serves each market right now, and the Command Centre, Lab and every chart carry a provenance plate.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Next.js type generation + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (engine, indicators, metrics, validation, calendar, demo data, providers, quiz, analysts) |
| `npm run test:e2e` | Playwright end-to-end journey (builds and starts the app on port 3100) |
| `npm run check` | typecheck + lint + unit tests |

## Environment variables

Everything is optional. See `.env.example`.

| Variable | Scope | Effect |
|---|---|---|
| `EODHD_API_TOKEN` | server | Enables real ASX, US and crypto history and delayed quotes from EODHD. |
| `MARKET_DATA_PROVIDER` | server | `coinbase` enables keyless crypto candles when EODHD is not configured. |
| `ANTHROPIC_API_KEY` | server | Enables Claude's review in the research assistant on top of the deterministic analysts. |
| `ANTHROPIC_MODEL` | server | Model for the review. Default `claude-opus-5-5`. |
| `NEXT_PUBLIC_SITE_URL` | client | Absolute origin for link-preview images (WhatsApp, Messenger, X). Optional on Vercel, where the production host is detected. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Reserved for the optional Supabase persistence layer (see `supabase/schema.sql`). Not wired in this release, so data stays in the browser. |

No secret is ever read in client code.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New Project** → import the repository. Framework preset: Next.js. Node 20 or later.
3. Add environment variables only if you want them (none are required). Set `EODHD_API_TOKEN` as a server environment variable to switch the ASX and US markets from demo data to real history. Redeploy after adding or changing it: the app shell is prerendered at build time and reads the setting then.
4. Deploy. Security headers (CSP, frame-ancestors, nosniff, referrer and permissions policies) are set in `next.config.ts`.

## What is where

- `PRODUCT.md` — product truth. `ARCHITECTURE.md` — layers and decisions. `SECURITY.md` — controls, audits, checklist. `DESIGN.md` — the visual system.
- `src/lib/quant` — the engine (`backtest.ts`, `metrics.ts`, `validation.ts`, `paper.ts`).
- `src/lib/market` — instruments, calendars, demo data, providers.
- `src/lib/strategies` — the ten strategy definitions as validated data.
- `src/lib/daily` — Today's Five.
- `src/app` — routes: `/` Command Centre (the best of six strategies on an instrument, with a luck test, the deflated Sharpe ratio and whether picking past winners has worked), `/markets`, `/lab` Strategies, `/arena`, `/paper` Portfolio, `/replay`, `/journal`, `/daily`, `/s/[code]` shared experiments.

## Research

`docs/research/` holds studies run on the engine with real EODHD data (kept out of the repository) and the code to reproduce them in `research/`:

- `picking-the-best.md`: on 140 real-market windows since 1992, the strategy with the best risk-adjusted score over two years did no better than a random pick the following year, and beat simply holding 29% of the time. Also documents the Command Centre's luck test, its calibration and its power.
- `demo-data-calibration.md`: how the demo dataset was recalibrated against real markets, with criteria written before tuning and the two it narrowly misses.

The engine is cross-checked by `research/reference_engine.py`, an independent Python implementation that reproduces it exactly on 36 years of AAPL and MSFT data.

## Honesty notes

- The demo dataset (demo-v3) is a seeded random process calibrated against real daily histories: fat tails, volatility clustering that lasts weeks, overnight gaps at the open, earnings-style gaps for single stocks, and no manufactured momentum. See `docs/research/demo-data-calibration.md` for the method, the pre-registered criteria and the two it narrowly misses. **A result on it is not a tradable edge.** Dividends and corporate actions are not modelled in demo data.
- Annualised return is hidden for periods under 180 days. Sharpe and Sortino are hidden with fewer than 30 bars, and trade statistics are flagged below 30 trades.
- Shared links carry the configuration and period, not the results. The recipient's browser recomputes them.
- Seeded Arena participants are bots and are labelled as bots. Simulated positions are labelled simulated.
