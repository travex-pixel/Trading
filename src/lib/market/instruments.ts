/**
 * Markets and instruments.
 *
 * An instrument id is "MARKET:SYMBOL" (e.g. "ASX:CBA", "US:AAPL",
 * "CRYPTO:BTC"). The registry below is the searchable universe; providers map
 * each instrument to their own symbol conventions. Everything about a market
 * that the engine, the UI and the data layer need to agree on lives here:
 * currency, calendar, default costs and the honest status of our support.
 */

import { CALENDARS, type MarketId } from "./calendar";

export type { MarketId } from "./calendar";

export type Currency = "AUD" | "USD";
export type InstrumentKind = "equity" | "etf" | "crypto";

export interface Instrument {
  /** "ASX:CBA" */
  id: string;
  symbol: string;
  name: string;
  market: MarketId;
  /** Listing venue shown to users. */
  exchange: string;
  currency: Currency;
  kind: InstrumentKind;
  sector?: string;
  /** Provider-specific symbols. */
  providers: {
    eodhd?: string;
    twelvedata?: { symbol: string; exchange?: string };
    coinbase?: string;
  };
  /** Starting level for the synthetic demo generator (approximate real price level, in the instrument's currency). */
  demoStart: number;
  /** Annualised volatility used by the demo generator. */
  demoVol: number;
}

export interface MarketSpec {
  id: MarketId;
  name: string;
  shortName: string;
  currency: Currency;
  /** Where the product stands on supporting this market, stated honestly in the UI. */
  status: "operational" | "planned";
  priority: number;
  description: string;
  defaultCosts: { feeBps: number; slippageBps: number; feeFixed: number };
  /** Plain-English execution assumptions shown in the Lab. */
  assumptions: string[];
  shortSelling: string;
  settlement: string;
}

export const MARKETS: Record<MarketId, MarketSpec> = {
  ASX: {
    id: "ASX",
    name: "Australian Securities Exchange",
    shortName: "ASX",
    currency: "AUD",
    status: "operational",
    priority: 1,
    description: "Australian equities and ETFs. Sessions 10:00 to 16:00 Sydney time, weekends and national holidays closed.",
    // A flat brokerage per order is the norm for Australian retail brokers; 10 AUD is a representative mid-range figure.
    defaultCosts: { feeBps: 0, slippageBps: 5, feeFixed: 10 },
    assumptions: [
      "Fills at the next bar's open after the signal, inside the 10:00–16:00 session.",
      "Overnight gaps are real: a stop touched at the open fills at the open, not the stop price.",
      "Brokerage is a flat fee per order plus optional basis points. Slippage is charged per side.",
      "Long only. Short selling is not modelled. On the ASX it needs a stock borrow and is publicly disclosed, and a future release may add it.",
      "Prices are split- and dividend-adjusted when the data source provides adjusted closes. The demo dataset models neither.",
    ],
    shortSelling: "Not modelled. Version one is long-only across all markets.",
    settlement: "T+2 in the real market. The simulator settles cash on fill.",
  },
  US: {
    id: "US",
    name: "US equities and ETFs",
    shortName: "US",
    currency: "USD",
    status: "operational",
    priority: 2,
    description: "NYSE and Nasdaq listed stocks and ETFs. Regular session 09:30 to 16:00 New York time.",
    defaultCosts: { feeBps: 0, slippageBps: 3, feeFixed: 0 },
    assumptions: [
      "Fills at the next bar's open after the signal, inside the regular 09:30–16:00 session. Pre- and post-market are not traded.",
      "Zero-commission brokerage is the default. Slippage is charged per side.",
      "Long only. Short selling is not modelled.",
      "Early-close days are treated as full sessions.",
    ],
    shortSelling: "Not modelled. Version one is long-only across all markets.",
    settlement: "T+1 (informational).",
  },
  CRYPTO: {
    id: "CRYPTO",
    name: "Cryptocurrency",
    shortName: "Crypto",
    currency: "USD",
    status: "operational",
    priority: 3,
    description: "Spot crypto against USD, trading 24/7 in UTC.",
    defaultCosts: { feeBps: 10, slippageBps: 5, feeFixed: 0 },
    assumptions: ["Fills at the next bar's open after the signal, around the clock.", "Taker fee in basis points per side plus slippage.", "Long only, with no leverage and no perpetuals."],
    shortSelling: "Not modelled.",
    settlement: "Immediate.",
  },
};

export const MARKET_ORDER: MarketId[] = ["ASX", "US", "CRYPTO"];
export const DEFAULT_MARKET: MarketId = "ASX";

/* ------------------------------------------------------------------------- */
/* Universe                                                                   */
/* ------------------------------------------------------------------------- */

function asx(symbol: string, name: string, kind: InstrumentKind, sector: string, demoStart: number, demoVol: number): Instrument {
  return {
    id: `ASX:${symbol}`,
    symbol,
    name,
    market: "ASX",
    exchange: "ASX",
    currency: "AUD",
    kind,
    sector,
    providers: { eodhd: `${symbol}.AU`, twelvedata: { symbol, exchange: "ASX" } },
    demoStart,
    demoVol,
  };
}

function us(symbol: string, name: string, exchange: string, kind: InstrumentKind, sector: string, demoStart: number, demoVol: number): Instrument {
  return {
    id: `US:${symbol}`,
    symbol,
    name,
    market: "US",
    exchange,
    currency: "USD",
    kind,
    sector,
    providers: { eodhd: `${symbol.replace(".", "-")}.US`, twelvedata: { symbol } },
    demoStart,
    demoVol,
  };
}

function crypto(symbol: string, name: string, demoStart: number, demoVol: number): Instrument {
  return {
    id: `CRYPTO:${symbol}`,
    symbol,
    name,
    market: "CRYPTO",
    exchange: "Crypto (USD)",
    currency: "USD",
    kind: "crypto",
    providers: { eodhd: `${symbol}-USD.CC`, twelvedata: { symbol: `${symbol}/USD` }, coinbase: `${symbol}-USD` },
    demoStart,
    demoVol,
  };
}

export const INSTRUMENTS: Instrument[] = [
  // ASX (primary)
  asx("CBA", "Commonwealth Bank of Australia", "equity", "Financials", 150, 0.18),
  asx("BHP", "BHP Group", "equity", "Materials", 42, 0.26),
  asx("CSL", "CSL Limited", "equity", "Health Care", 280, 0.22),
  asx("WES", "Wesfarmers", "equity", "Consumer Discretionary", 70, 0.2),
  asx("MQG", "Macquarie Group", "equity", "Financials", 210, 0.24),
  asx("NAB", "National Australia Bank", "equity", "Financials", 38, 0.19),
  asx("WBC", "Westpac Banking Corporation", "equity", "Financials", 32, 0.2),
  asx("ANZ", "ANZ Group Holdings", "equity", "Financials", 29, 0.2),
  asx("WOW", "Woolworths Group", "equity", "Consumer Staples", 32, 0.18),
  asx("FMG", "Fortescue", "equity", "Materials", 19, 0.36),
  asx("TLS", "Telstra Group", "equity", "Communication Services", 4.2, 0.17),
  asx("RIO", "Rio Tinto", "equity", "Materials", 115, 0.26),
  asx("REA", "REA Group", "equity", "Communication Services", 240, 0.28),
  asx("GMG", "Goodman Group", "equity", "Real Estate", 33, 0.27),
  asx("XRO", "Xero", "equity", "Information Technology", 160, 0.34),
  asx("WTC", "WiseTech Global", "equity", "Information Technology", 110, 0.4),
  asx("VAS", "Vanguard Australian Shares Index ETF", "etf", "Broad market", 100, 0.15),
  asx("A200", "Betashares Australia 200 ETF", "etf", "Broad market", 135, 0.15),
  asx("STW", "SPDR S&P/ASX 200 ETF", "etf", "Broad market", 70, 0.15),
  // US (secondary)
  us("AAPL", "Apple", "NASDAQ", "equity", "Information Technology", 230, 0.28),
  us("MSFT", "Microsoft", "NASDAQ", "equity", "Information Technology", 420, 0.25),
  us("NVDA", "NVIDIA", "NASDAQ", "equity", "Information Technology", 130, 0.5),
  us("AMZN", "Amazon.com", "NASDAQ", "equity", "Consumer Discretionary", 190, 0.32),
  us("META", "Meta Platforms", "NASDAQ", "equity", "Communication Services", 560, 0.36),
  us("GOOGL", "Alphabet Class A", "NASDAQ", "equity", "Communication Services", 170, 0.3),
  us("TSLA", "Tesla", "NASDAQ", "equity", "Consumer Discretionary", 250, 0.6),
  us("JPM", "JPMorgan Chase", "NYSE", "equity", "Financials", 220, 0.24),
  us("BRK.B", "Berkshire Hathaway Class B", "NYSE", "equity", "Financials", 450, 0.18),
  us("SPY", "SPDR S&P 500 ETF Trust", "NYSE Arca", "etf", "Broad market", 560, 0.16),
  us("QQQ", "Invesco QQQ Trust", "NASDAQ", "etf", "Broad market", 480, 0.22),
  // Crypto (optional)
  crypto("BTC", "Bitcoin", 16_500, 0.6),
  crypto("ETH", "Ethereum", 1_200, 0.75),
  crypto("SOL", "Solana", 15, 1.1),
];

const byId = new Map(INSTRUMENTS.map((i) => [i.id, i]));

export function getInstrument(id: string): Instrument | null {
  return byId.get(id) ?? null;
}

export function requireInstrument(id: string): Instrument {
  const i = byId.get(id);
  if (!i) throw new Error(`Unknown instrument ${id}`);
  return i;
}

export function isInstrumentId(id: unknown): id is string {
  return typeof id === "string" && byId.has(id);
}

export function instrumentsFor(market: MarketId): Instrument[] {
  return INSTRUMENTS.filter((i) => i.market === market);
}

export function marketOf(instrumentId: string): MarketId {
  return requireInstrument(instrumentId).market;
}

export function currencyOf(instrumentId: string): Currency {
  return requireInstrument(instrumentId).currency;
}

/** Default instrument for a market (the one a fresh user should see first). */
export function defaultInstrument(market: MarketId): Instrument {
  const preferred: Record<MarketId, string> = { ASX: "ASX:CBA", US: "US:AAPL", CRYPTO: "CRYPTO:BTC" };
  return requireInstrument(preferred[market]);
}

/** Second instrument for rotation strategies in a market. */
export function rotationPair(market: MarketId): [string, string] {
  const pairs: Record<MarketId, [string, string]> = { ASX: ["ASX:CBA", "ASX:BHP"], US: ["US:AAPL", "US:MSFT"], CRYPTO: ["CRYPTO:BTC", "CRYPTO:ETH"] };
  return pairs[market];
}

/** Case-insensitive search over ticker and name, ranked ticker-prefix first. */
export function searchInstruments(query: string, market?: MarketId): Instrument[] {
  const q = query.trim().toUpperCase();
  const pool = market ? instrumentsFor(market) : INSTRUMENTS;
  if (!q) return pool;
  const score = (i: Instrument) => {
    const sym = i.symbol.toUpperCase();
    const name = i.name.toUpperCase();
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (sym.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return Infinity;
  };
  return pool
    .map((i) => ({ i, s: score(i) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.i);
}

/** Short label such as "CBA · ASX · AUD". */
export function instrumentLabel(id: string): string {
  const i = getInstrument(id);
  if (!i) return id;
  return `${i.symbol} · ${i.exchange} · ${i.currency}`;
}

export const CURRENCY_PREFIX: Record<Currency, string> = { AUD: "A$", USD: "US$" };

export { CALENDARS };
