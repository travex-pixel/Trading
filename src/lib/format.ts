/** Number and date formatting used across the UI. */

export type Currency = "AUD" | "USD";

/** Unambiguous prefixes: an Australian-first product shows A$ and US$ rather than a bare dollar sign. */
export const CURRENCY_PREFIX: Record<Currency, string> = { AUD: "A$", USD: "US$" };

const compact = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtMoney(v: number, opts: { compact?: boolean; cents?: boolean; currency?: Currency; sign?: boolean } = {}): string {
  if (!Number.isFinite(v)) return "n/a";
  const prefix = CURRENCY_PREFIX[opts.currency ?? "AUD"];
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  const abs = Math.abs(v);
  if (opts.compact && abs >= 100_000) return `${sign}${prefix}${compact.format(abs)}`;
  return `${sign}${prefix}${opts.cents ? num2.format(abs) : num0.format(abs)}`;
}

/** A price: whole units above 1,000, cents below, three decimals below 10. */
export function fmtPrice(v: number, currency: Currency = "AUD"): string {
  if (!Number.isFinite(v)) return "n/a";
  const prefix = CURRENCY_PREFIX[currency];
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}${prefix}${num0.format(abs)}`;
  if (abs < 10) return `${sign}${prefix}${abs.toFixed(3)}`;
  return `${sign}${prefix}${num2.format(abs)}`;
}

export function fmtPct(v: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const digits = opts.digits ?? 1;
  const s = v.toFixed(digits);
  return `${opts.sign && v > 0 ? "+" : ""}${s}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return v === Infinity ? "∞" : "n/a";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return Math.round(v).toLocaleString("en-US");
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function fmtDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function fmtDuration(bars: number | null, timeframe: "1h" | "4h" | "1d"): string {
  if (bars === null || !Number.isFinite(bars)) return "n/a";
  const hours = bars * (timeframe === "1h" ? 1 : timeframe === "4h" ? 4 : 24);
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  return `${(days / 30.44).toFixed(1)}mo`;
}

export function signClass(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "text-ink-2";
  return v > 0 ? "text-up" : "text-down";
}

export function timeframeLabel(tf: "1h" | "4h" | "1d"): string {
  return tf === "1h" ? "Hourly" : tf === "4h" ? "4-hour" : "Daily";
}
