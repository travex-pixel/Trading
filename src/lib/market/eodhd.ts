/**
 * EODHD response parsing, kept free of server-only imports so it can be unit
 * tested. Shapes follow the EODHD documentation:
 *   EOD rows:      { date, open, high, low, close, adjusted_close, volume }
 *   Intraday rows: { timestamp (unix s), open, high, low, close, volume }
 *   Real-time:     { code, timestamp, open, high, low, close, volume, previousClose, change, change_p }
 */

import type { Candle, DataSource } from "@/lib/quant/types";
import { sessionFor, type MarketId } from "./calendar";

export function eodhdSource(adjustment: DataSource["adjustment"], freshness: DataSource["freshness"]): DataSource {
  return {
    provider: "eodhd",
    version: "eodhd-v1",
    label: freshness === "delayed" ? "EODHD · delayed 15–20 min" : adjustment === "splits_dividends" ? "EODHD · historical, split & dividend adjusted" : "EODHD · historical, unadjusted",
    isSynthetic: false,
    freshness,
    adjustment,
    asOf: Date.now(),
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Parse EODHD end-of-day rows into session-stamped, adjusted candles. */
export function parseEodhdDaily(rows: unknown, market: MarketId): Candle[] {
  if (!Array.isArray(rows)) throw new Error("Unexpected EODHD payload.");
  const out: Candle[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date : null;
    const o = num(r.open), h = num(r.high), l = num(r.low), c = num(r.close), v = num(r.volume) ?? 0;
    const adj = num(r.adjusted_close);
    if (!date || o === null || h === null || l === null || c === null || c <= 0) continue;
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) continue;
    const session = sessionFor(market, y, m, d);
    const time = session ? session.openUtc : Date.UTC(y, m - 1, d);
    // Scale OHLC by the adjustment factor so the whole bar is adjusted consistently.
    const f = adj !== null && adj > 0 ? adj / c : 1;
    const bar: Candle = { time, open: o * f, high: Math.max(h, o, c) * f, low: Math.min(l, o, c) * f, close: c * f, volume: v };
    if (bar.low > 0) out.push(bar);
  }
  out.sort((a, b) => a.time - b.time);
  return dedupe(out);
}

/** Parse EODHD intraday rows (unix `timestamp` seconds, unadjusted OHLCV). Exported for tests. */
export function parseEodhdIntraday(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) throw new Error("Unexpected EODHD payload.");
  const out: Candle[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const ts = num(r.timestamp);
    const o = num(r.open), h = num(r.high), l = num(r.low), c = num(r.close), v = num(r.volume) ?? 0;
    if (ts === null || o === null || h === null || l === null || c === null || c <= 0) continue;
    out.push({ time: ts * 1000, open: o, high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, volume: v });
  }
  out.sort((a, b) => a.time - b.time);
  return dedupe(out);
}

export function dedupe(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    if (out.length && out[out.length - 1].time === c.time) continue;
    if (c.low <= 0 || c.high < c.low) continue;
    out.push(c);
  }
  return out;
}

export interface Quote {
  instrumentId: string;
  price: number;
  previousClose: number | null;
  changePct: number | null;
  /** Exchange timestamp (ms) of the quote. */
  time: number;
  source: DataSource;
}

/** Parse an EODHD real-time (delayed) quote object. Exported for tests. */
export function parseEodhdQuote(obj: unknown, instrumentId: string): Quote | null {
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  const price = num(r.close);
  const ts = num(r.timestamp);
  if (price === null || ts === null || price <= 0) return null;
  const prev = num(r.previousClose);
  const changePct = num(r.change_p);
  return { instrumentId, price, previousClose: prev, changePct: changePct ?? (prev ? (price / prev - 1) * 100 : null), time: ts * 1000, source: eodhdSource("none", "delayed") };
}

