# EdgeLab architecture

EdgeLab is a modular monolith: one Next.js application with a pure TypeScript quantitative core that runs identically in the browser and on the server. There are no microservices, queues or background workers, and nothing in version one needs them.

## Layers

```
src/lib/quant/        Pure, deterministic quant core. No React, no I/O.
  types.ts            Candle, Trade, EquityPoint, BacktestResult, metrics.
  indicators.ts       Causal indicators (SMA, EMA, RSI, MACD, ATR, Donchian, ...).
  backtest.ts         Bar-by-bar engine. Next-bar-open fills, fees, slippage, stops.
  metrics.ts          Metrics with explicit "not estimable" rules and definitions.
  validation.ts       Train/test splits, walk-forward, sensitivity, regimes, verdicts.
  benchmarks.ts       Buy and hold, cash and naive momentum under identical rules.
  paper.ts            Paper trading as a replayed forward simulation.
  prng.ts             Seeded PRNG for demo data and the random baseline.

src/lib/strategies/   Strategy *definitions* as data.
  schema.ts           Zod schema: the only shape a strategy can take. No code.
  runtime.ts          The prepare/signal contract the engine calls.
  library.ts          Ten strategies with plain-English metadata and signal logic.

src/lib/market/       Markets and data.
  instruments.ts      Instrument registry (ASX, US, crypto), market specs, currencies, default costs.
  calendar.ts         Trading calendars: sessions, timezones with DST, ASX/NYSE holidays, market status.
  demo-data.ts        Deterministic synthetic bars for every instrument, session-aware (labelled demo).
  eodhd.ts            EODHD response parsing (pure, unit-tested).
  provider.ts         Server-only provider chain: EODHD -> Coinbase (crypto) -> demo, with provenance.
  client.ts           Browser fetch + cache + hook for candle series.

src/lib/daily/        Today's Five: the daily calibration quiz generated from the engine.

src/lib/store/        Persistence behind a Repository interface.
  local-store.ts      Browser localStorage, versioned, schema-validated on read.
  snapshot.ts         Shareable URL snapshots (config + period, validated on decode).

src/lib/ai/           Research assistant: rule-based analysts first, LLM optional.

src/app/              Routes (App Router). Server components for shells, client
                      components for anything interactive.
src/components/       UI primitives, charts, feature components.
```

## Key decisions

**The engine runs in the browser.** A backtest over three years of 4h bars takes tens of milliseconds, so the Strategy Lab, Arena, Replay and paper trading all run the same deterministic code client-side after fetching candles once. This removes a network round trip per experiment, makes the replay instant, and means shared links reproduce results rather than transmitting them. The same functions are importable server-side for route handlers and the AI assistant. Nothing about this decision prevents moving heavy work (walk-forward over hourly data, batch optimisation) to a route handler or a worker later.

**Strategies are data, never code.** A strategy configuration is a Zod-validated discriminated union. The signal logic for each kind lives in the library and is reviewed like any other code. There is no expression language, no `eval`, no `Function`, no plugin loading. This is the single most important security property of the product.

**No look-ahead by construction.** Indicators are causal functions precomputed once; the engine asks the strategy for a decision at bar close and fills at the next bar's open. Replay reads the same signal records the backtest produced, so the replay cannot show anything the strategy did not know at the time.

**ASX first, markets as data.** An instrument id is `MARKET:SYMBOL`. The registry carries each market's currency, calendar, execution assumptions and default costs; the engine never special-cases a market. Equity bars exist only inside sessions on trading days (daily bars are stamped with the session open), so next-bar fills cross overnight gaps and stops that gap fill at the open. Annualisation uses the market's bars per year (252 trading days for equities, 365 for crypto). A flat brokerage per order sits alongside basis-point fees because that is how Australian retail brokers charge.

**Demo mode is the default, not a fallback.** The deterministic synthetic dataset ships with the app for every instrument, is cached in memory on first use, and is labelled "DEMO DATA — NOT LIVE MARKET DATA" wherever it appears. Every `DataSource` states provider, freshness (simulated, historical, delayed, real-time) and price adjustment. Real data comes from EODHD when a server-side token is present (ASX, US, crypto; adjusted daily bars, unadjusted intraday, delayed quotes); Coinbase public candles cover crypto without a key; both fall back to demo with a visible label if they fail. Twelve Data and Alpaca were evaluated and not selected (licensing and coverage; see README).

**Local-first persistence.** Experiments, paper portfolios and competitions are stored in the browser behind a `Repository<T>` interface and validated on read. Supabase is an optional second implementation of the same interface; the demo never requires credentials.

**Comparison and competition are the same computation.** A competition is a list of strategy configurations run under identical rules (dates, assets, capital, costs); the leaderboard is the comparison table sorted by a risk-adjusted score. Seeded demo participants are labelled as bots, never as people.

**AI is layered.** Deterministic analysts (sample size, benchmark, fees, walk-forward degradation, parameter stability, regime concentration) produce findings with no external calls. An optional LLM layer, enabled only by a server-side key, is given those findings and the result summary and returns schema-validated prose. The LLM never sees raw user input as instructions and never produces numbers that are not already in the result.

## Data flow

```
GET /api/market/candles?assets=ASX:CBA,ASX:BHP&timeframe=1d
  -> provider.ts (server) -> columnar JSON, cache headers
  -> useCandles() (client, in-memory cache)
  -> runBacktest(config, series, period)   (client)
  -> runBenchmarks / walkForward / sensitivity / regimePerformance
  -> assessEdge -> verdict + findings
  -> UI; optional save to store as an Experiment version
```

## Data model (entities)

Strategy configuration (embedded JSON), Experiment (lineageId + version for history), PaperPortfolio (config + start + simulated clock), Competition (rules + participants). Market candles are not persisted in version one: demo data is regenerated deterministically and live data is cached in memory with a short TTL. Backtest results are reproducible from (config, period, dataset version) and are summarised, not stored in full.

## Adding things later

- New instrument: one line in the registry (symbol, name, exchange, provider symbols, demo start level and volatility). New market: a calendar entry (timezone, session, holidays), a market spec, and a demo factor; Forex would follow this path.
- New strategy kind: one schema variant, one library entry (metadata + prepare), one tunable-parameter entry. Tests follow the existing pattern.
- Real multiplayer competitions: implement `Repository<Competition>` against Supabase with row-level security, swap `kind: "seeded_bot"` for `kind: "invited"` participants, and add auth. The UI already treats participants as a list of configurations.
- Heavy validation off the main thread: `walkForward` and `sensitivity` are pure functions and can be moved to a Web Worker or a route handler unchanged.
