/**
 * Trading calendars and sessions.
 *
 * Each market has a timezone, a daily session and a holiday rule set. Bars
 * for equities exist only inside sessions on trading days; crypto trades
 * around the clock in UTC. Daily bars are stamped with the session open so
 * every timeframe of one market shares the same clock.
 *
 * Timezone arithmetic uses Intl only (no dependency), so daylight saving in
 * Australia/Sydney and America/New_York is handled by the platform's tz data.
 *
 * Documented simplifications:
 *  - ASX: continuous trading is modelled as 10:00 to 16:00 local. The
 *    staggered opening auction (10:00 to 10:09) and the closing single price
 *    auction (about 16:10) are not modelled separately.
 *  - US: 09:30 to 16:00 local. Early-close days (the day after Thanksgiving,
 *    Christmas Eve) are treated as full sessions.
 */

import type { Timeframe } from "@/lib/quant/types";

export type MarketId = "ASX" | "US" | "CRYPTO";

export interface Session {
  /** Local time "HH:MM". */
  open: string;
  close: string;
}

export interface MarketCalendar {
  id: MarketId;
  timezone: string;
  /** null means 24/7 trading. */
  session: Session | null;
  tradingDaysPerYear: number;
}

export const CALENDARS: Record<MarketId, MarketCalendar> = {
  ASX: { id: "ASX", timezone: "Australia/Sydney", session: { open: "10:00", close: "16:00" }, tradingDaysPerYear: 252 },
  US: { id: "US", timezone: "America/New_York", session: { open: "09:30", close: "16:00" }, tradingDaysPerYear: 252 },
  CRYPTO: { id: "CRYPTO", timezone: "UTC", session: null, tradingDaysPerYear: 365 },
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ------------------------------------------------------------------------- */
/* Timezone arithmetic                                                        */
/* ------------------------------------------------------------------------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local wall-clock parts of an instant in a timezone. */
export function localParts(tz: string, utcMs: number): LocalParts {
  const parts = formatter(tz).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** Offset of a timezone from UTC at an instant, in minutes (positive east of UTC). */
export function tzOffsetMinutes(tz: string, utcMs: number): number {
  const p = localParts(tz, utcMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** The UTC instant of a local wall-clock time in a timezone. */
export function zonedToUtc(tz: string, year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - tzOffsetMinutes(tz, guess) * 60_000;
  // Second pass handles a DST boundary between the guess and the result.
  utc = guess - tzOffsetMinutes(tz, utc) * 60_000;
  return utc;
}

/* ------------------------------------------------------------------------- */
/* Holidays                                                                   */
/* ------------------------------------------------------------------------- */

/** Anonymous Gregorian algorithm. Returns [month, day] of Easter Sunday. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

type YMD = string; // "YYYY-MM-DD"

function ymd(year: number, month: number, day: number): YMD {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(year: number, month: number, day: number, n: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The n-th (1-based) given weekday of a month; n = -1 means the last. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = weekdayOf(year, month, 1);
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekdayOf(year, month, lastDay);
  return lastDay - ((last - weekday + 7) % 7);
}

/** Move a weekend date to the following Monday (Saturday -> +2, Sunday -> +1). */
function mondayise(year: number, month: number, day: number): [number, number, number] {
  const wd = weekdayOf(year, month, day);
  if (wd === 6) return addDays(year, month, day, 2);
  if (wd === 0) return addDays(year, month, day, 1);
  return [year, month, day];
}

const holidayCache = new Map<string, Set<YMD>>();

/** ASX trading holidays for a year (national public holidays observed by the exchange). */
export function asxHolidays(year: number): Set<YMD> {
  const key = `ASX:${year}`;
  const cached = holidayCache.get(key);
  if (cached) return cached;
  const set = new Set<YMD>();
  const add = (y: number, m: number, d: number) => set.add(ymd(y, m, d));
  add(...mondayise(year, 1, 1)); // New Year's Day
  add(...mondayise(year, 1, 26)); // Australia Day
  const [em, ed] = easterSunday(year);
  add(...addDays(year, em, ed, -2)); // Good Friday
  add(...addDays(year, em, ed, 1)); // Easter Monday
  if (weekdayOf(year, 4, 25) !== 0 && weekdayOf(year, 4, 25) !== 6) add(year, 4, 25); // Anzac Day: no substitute
  add(year, 6, nthWeekday(year, 6, 1, 2)); // King's Birthday (second Monday of June)
  // Christmas and Boxing Day with substitutes for weekends.
  const xmasWd = weekdayOf(year, 12, 25);
  if (xmasWd === 6) {
    add(year, 12, 27);
    add(year, 12, 28);
  } else if (xmasWd === 0) {
    add(year, 12, 26);
    add(year, 12, 27);
  } else if (xmasWd === 5) {
    add(year, 12, 25);
    add(year, 12, 28); // Boxing Day falls on Saturday -> Monday
  } else {
    add(year, 12, 25);
    add(year, 12, 26);
  }
  holidayCache.set(key, set);
  return set;
}

/** NYSE trading holidays for a year. */
export function nyseHolidays(year: number): Set<YMD> {
  const key = `US:${year}`;
  const cached = holidayCache.get(key);
  if (cached) return cached;
  const set = new Set<YMD>();
  const add = (y: number, m: number, d: number) => set.add(ymd(y, m, d));
  const observed = (y: number, m: number, d: number) => {
    const wd = weekdayOf(y, m, d);
    if (wd === 6) return addDays(y, m, d, -1);
    if (wd === 0) return addDays(y, m, d, 1);
    return [y, m, d] as [number, number, number];
  };
  // New Year's Day: observed Monday if Sunday; if Saturday, NYSE does not observe on Friday.
  if (weekdayOf(year, 1, 1) === 0) add(year, 1, 2);
  else if (weekdayOf(year, 1, 1) !== 6) add(year, 1, 1);
  add(year, 1, nthWeekday(year, 1, 1, 3)); // Martin Luther King Jr. Day
  add(year, 2, nthWeekday(year, 2, 1, 3)); // Washington's Birthday
  const [em, ed] = easterSunday(year);
  add(...addDays(year, em, ed, -2)); // Good Friday
  add(year, 5, nthWeekday(year, 5, 1, -1)); // Memorial Day
  if (year >= 2022) add(...observed(year, 6, 19)); // Juneteenth
  add(...observed(year, 7, 4)); // Independence Day
  add(year, 9, nthWeekday(year, 9, 1, 1)); // Labor Day
  add(year, 11, nthWeekday(year, 11, 4, 4)); // Thanksgiving
  add(...observed(year, 12, 25)); // Christmas
  holidayCache.set(key, set);
  return set;
}

export function holidaysFor(market: MarketId, year: number): Set<YMD> {
  if (market === "ASX") return asxHolidays(year);
  if (market === "US") return nyseHolidays(year);
  return new Set();
}

/* ------------------------------------------------------------------------- */
/* Trading days and sessions                                                  */
/* ------------------------------------------------------------------------- */

export interface TradingDay {
  /** Local calendar date. */
  date: YMD;
  /** Session open and close as UTC instants. */
  openUtc: number;
  closeUtc: number;
}

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h, m];
}

/** Whether a local calendar date is a trading day for the market. */
export function isTradingDate(market: MarketId, year: number, month: number, day: number): boolean {
  const cal = CALENDARS[market];
  if (!cal.session) return true;
  const wd = weekdayOf(year, month, day);
  if (wd === 0 || wd === 6) return false;
  return !holidaysFor(market, year).has(ymd(year, month, day));
}

/** Whether an instant falls on a trading day in the market's local calendar. */
export function isTradingDay(market: MarketId, utcMs: number): boolean {
  const cal = CALENDARS[market];
  if (!cal.session) return true;
  const p = localParts(cal.timezone, utcMs);
  return isTradingDate(market, p.year, p.month, p.day);
}

/** The session for a local calendar date, or null when the market is closed that day. */
export function sessionFor(market: MarketId, year: number, month: number, day: number): TradingDay | null {
  const cal = CALENDARS[market];
  if (!cal.session) {
    const open = Date.UTC(year, month - 1, day);
    return { date: ymd(year, month, day), openUtc: open, closeUtc: open + DAY };
  }
  if (!isTradingDate(market, year, month, day)) return null;
  const [oh, om] = parseHM(cal.session.open);
  const [ch, cm] = parseHM(cal.session.close);
  return { date: ymd(year, month, day), openUtc: zonedToUtc(cal.timezone, year, month, day, oh, om), closeUtc: zonedToUtc(cal.timezone, year, month, day, ch, cm) };
}

/** Every trading session whose open falls within [startUtc, endUtc]. */
export function tradingSessions(market: MarketId, startUtc: number, endUtc: number): TradingDay[] {
  const cal = CALENDARS[market];
  const out: TradingDay[] = [];
  // Walk local calendar dates from one day before start to one day after end.
  const first = localParts(cal.timezone, startUtc - DAY);
  let [y, m, d] = [first.year, first.month, first.day];
  const limit = endUtc + DAY;
  for (let guard = 0; guard < 20_000; guard++) {
    const s = sessionFor(market, y, m, d);
    if (s) {
      if (s.openUtc > limit) break;
      if (s.openUtc >= startUtc && s.openUtc <= endUtc) out.push(s);
    } else if (Date.UTC(y, m - 1, d) > limit) break;
    [y, m, d] = addDays(y, m, d, 1);
  }
  return out;
}

/** Bar open timestamps for one session at a timeframe. The last intraday bar may be shorter than the interval. */
export function sessionBarTimes(session: TradingDay, timeframe: Timeframe): number[] {
  if (timeframe === "1d") return [session.openUtc];
  const step = timeframe === "1h" ? HOUR : 4 * HOUR;
  const out: number[] = [];
  for (let t = session.openUtc; t < session.closeUtc; t += step) out.push(t);
  return out;
}

/** Approximate bars per calendar year for annualisation, by market and timeframe. */
export function barsPerYear(market: MarketId, timeframe: Timeframe): number {
  const cal = CALENDARS[market];
  if (!cal.session) return timeframe === "1d" ? 365 : timeframe === "4h" ? 6 * 365 : 24 * 365;
  const [oh, om] = parseHM(cal.session.open);
  const [ch, cm] = parseHM(cal.session.close);
  const sessionMs = (ch * 60 + cm - (oh * 60 + om)) * 60_000;
  const perDay = timeframe === "1d" ? 1 : Math.ceil(sessionMs / (timeframe === "1h" ? HOUR : 4 * HOUR));
  return perDay * cal.tradingDaysPerYear;
}

/** Bars per trading day (for position-sizing volatility conversions). */
export function barsPerDay(market: MarketId, timeframe: Timeframe): number {
  return barsPerYear(market, timeframe) / CALENDARS[market].tradingDaysPerYear;
}

export type MarketStatus = { state: "open"; closesAt: number } | { state: "closed"; opensAt: number | null; reason: "weekend" | "holiday" | "after_hours" | "pre_market" } | { state: "always_open" };

/** Whether the market is open at an instant, and when it next changes. */
export function marketStatus(market: MarketId, utcMs: number = Date.now()): MarketStatus {
  const cal = CALENDARS[market];
  if (!cal.session) return { state: "always_open" };
  const p = localParts(cal.timezone, utcMs);
  const today = sessionFor(market, p.year, p.month, p.day);
  if (today && utcMs >= today.openUtc && utcMs < today.closeUtc) return { state: "open", closesAt: today.closeUtc };
  // Find the next session open.
  let [y, m, d] = [p.year, p.month, p.day];
  let next: TradingDay | null = null;
  for (let i = 0; i < 15; i++) {
    const s = sessionFor(market, y, m, d);
    if (s && s.openUtc > utcMs) {
      next = s;
      break;
    }
    [y, m, d] = addDays(y, m, d, 1);
  }
  const wd = p.weekday;
  const reason: Extract<MarketStatus, { state: "closed" }>["reason"] = wd === 0 || wd === 6 ? "weekend" : !today ? "holiday" : utcMs < today.openUtc ? "pre_market" : "after_hours";
  return { state: "closed", opensAt: next?.openUtc ?? null, reason };
}

/** Human label for a timezone offset at an instant, e.g. "AEDT (UTC+11)". */
export function tzLabel(market: MarketId, utcMs: number = Date.now()): string {
  const cal = CALENDARS[market];
  if (cal.timezone === "UTC") return "UTC";
  const offset = tzOffsetMinutes(cal.timezone, utcMs);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const name = cal.id === "ASX" ? (offset === 660 ? "AEDT" : "AEST") : offset === -240 ? "EDT" : "EST";
  return `${name} (UTC${sign}${hh}${mm ? ":" + String(mm).padStart(2, "0") : ""})`;
}
