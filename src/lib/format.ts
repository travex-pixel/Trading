/** Number and date formatting used across the UI. */

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function fmtMoney(v: number, opts: { compact?: boolean; cents?: boolean } = {}): string {
  if (!Number.isFinite(v)) return "n/a";
  if (opts.compact && Math.abs(v) >= 100_000) return `$${compact.format(v)}`;
  return opts.cents ? money2.format(v) : money0.format(v);
}

export function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "n/a";
  if (Math.abs(v) >= 1000) return money0.format(v);
  return money2.format(v);
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
