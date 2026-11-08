# EdgeLab release report: ASX-first, multi-market, daily game

Branch `ccr-ae0a08d8-f8h9pp`, 8 November 2026. Everything below was verified in this build. Nothing was tested against a paid data feed, because no subscription was purchased.

## 1. What changed

- **ASX is the primary market.** Instrument ids are `MARKET:SYMBOL`. The registry carries 19 ASX equities and ETFs, 11 US equities and ETFs and 3 crypto assets, each with name, exchange, currency, provider symbols and demo parameters. Forex is listed as not available, not as a market.
- **Calendars and sessions.** Sydney (AEST/AEDT) and New York (EST/EDT) daylight saving, ASX and NYSE public holidays, session hours (10:00–16:00 Sydney, 09:30–16:00 New York, 24/7 crypto). Equity bars exist only inside sessions, daily bars are stamped with the session open, fills cross overnight gaps, and stops that gap fill at the open.
- **Currency and costs.** Backtests, paper portfolios, leaderboards and provenance plates state AUD or USD. A flat brokerage per order (default A$10 on ASX) sits beside basis-point fees and slippage. All three are configurable per experiment and per competition. Annualisation uses 252 trading days for equities and 365 for crypto.
- **Short selling** is stated as not modelled on every market's execution-assumptions panel. All strategies are long-only.
- **Provider-independent data layer.** `src/lib/market/provider.ts` (server-only) resolves EODHD → Coinbase (crypto) → demo, with a `DataSource` on every series stating provider, freshness (simulated · historical · delayed · real-time) and adjustment (none · splits · splits and dividends). The Markets page shows which provider serves each market right now.
- **Markets page** (new route `/markets`): market selector showing only implemented markets, instrument table with last close or delayed quote, 1d/1m/1y change, sparkline, and a Test link into the Lab, plus a data-connections table.
- **Instrument picker** everywhere a strategy is configured: market segmented control over a searchable listbox showing ticker · name · exchange · currency.
- **Command Centre** rebuilt as a cockpit: ASX session status with timezone, four-instrument strip with regime read, simulated-portfolio headline per currency, strategy leaderboard, signal monitor for saved strategies, open simulated positions, recent experiments and derived alerts.
- **Today's Five**: a daily five-question calibration game built from real engine results on ASX instruments, seeded by the UTC date so everyone gets the same questions, scored, streaked and shareable. Reached from Home and `/daily`.
- **Navigation**: phone bottom bar Home · Markets · Strategies · Arena · Portfolio. The desktop rail adds Trade Replay, Research Journal and Today's Five.
- **Demo dataset v2**: per-market regime sets calibrated to plausible equity behaviour (STW: 9% CAGR, 15% volatility, 23% maximum drawdown over 2021–2025), session-aware with overnight gaps, labelled "DEMO DATA — NOT LIVE MARKET DATA" on every surface.
- **Documentation**: README (markets table, provider research, environment variables, deploy), ARCHITECTURE, SECURITY (provider licensing, token handling, audit log), PRODUCT (markets), DESIGN (tokens, type, components, motion, navigation).

## 2. What was preserved

Strategy library (ten strategies), guided builder, honest backtest engine, validation (train/test, walk-forward, sensitivity, regimes, verdicts), benchmarks, comparison, research journal with versions, Bot Arena with seeded bots labelled as bots, Trade Replay, paper trading, shareable links, the deterministic AI analysts and the optional Claude review. No pages were duplicated. The only new routes are `/markets` and `/daily`. Stored experiments with the old `BTC`/`ETH` ids migrate to `CRYPTO:BTC`/`CRYPTO:ETH` on read.

## 3. Markets genuinely operational

| Market | Status | On demo data | On real data |
|---|---|---|---|
| ASX | Operational | Yes, out of the box | With `EODHD_API_TOKEN` |
| US equities and ETFs | Operational | Yes | With `EODHD_API_TOKEN` |
| Crypto | Operational | Yes | With `EODHD_API_TOKEN`, or keyless via Coinbase (`MARKET_DATA_PROVIDER=coinbase`) |
| Forex | Not available | | |

## 4. Data providers

- **EODHD** (selected): ASX (`.AU`), US and crypto. End-of-day bars are split- and dividend-adjusted via `adjusted_close`, intraday unadjusted, quotes delayed 15–20 minutes. Response parsing is unit-tested. The live path was implemented but not exercised here because no token exists.
- **Coinbase Exchange** public candles: crypto only, no key.
- **Demo dataset**: always available, always labelled.
- **Rejected**: Twelve Data (free tier is non-display only and ASX is a paid add-on), Alpaca (no ASX coverage).

## 5. Keys and subscriptions you would need

Nothing was purchased. To move ASX and US from demo to real history:

- `EODHD_API_TOKEN` set as a server environment variable on Vercel. EODHD's "EOD Historical Data — All World" plan covers ASX end-of-day history (about US$20 per month at the time of research); intraday AU bars need their Extended plan (about US$30). Prices should be confirmed on eodhd.com before buying.
- Optional `ANTHROPIC_API_KEY` for the Claude review in the research assistant.
- No Supabase credentials are required. Persistence is browser-local.

The token is read only on the server, sent only to `eodhd.com` over HTTPS, and never appears in the browser, logs or the status API.

## 6. Remaining limitations

- Live EODHD responses were not seen in this environment. The parser is tested against documented response shapes.
- Dividends and corporate actions are not modelled in demo data. Real end-of-day bars are adjusted, intraday bars are not.
- Long-only. Weekly and monthly timeframes and sub-hourly intraday bars are not offered.
- Quotes are delayed, never real-time. No push notifications.
- The Supabase schema exists but is not wired, so competitions live in a single browser.
- No light theme.

## 7. Tests and results

| Suite | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm run lint` | passes, no warnings |
| `npm test` (Vitest) | 74 tests in 10 files pass: engine, indicators, metrics, validation, calendar, demo data, EODHD parsing, quiz, analysts, snapshot codec |
| `npm run test:e2e` (Playwright, production build, phone and desktop) | 12 tests pass: full research journey, Today's Five, ASX default market and AUD backtest with instrument switch, shared-link validation, market data API validation and demo labelling, security headers |
| `npm audit --omit=dev` | 0 vulnerabilities |

Screens reviewed at 390×844, 412×915 and 1440×900: Home, Markets, Strategies, Lab with an ASX instrument, Arena, Portfolio, Today's Five, Replay, Journal.
