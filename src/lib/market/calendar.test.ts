import { describe, expect, it } from "vitest";
import { asxHolidays, barsPerYear, easterSunday, isTradingDate, localParts, marketStatus, nyseHolidays, sessionBarTimes, sessionFor, tradingSessions, tzOffsetMinutes, zonedToUtc } from "./calendar";

describe("timezones", () => {
  it("knows Sydney daylight saving", () => {
    // January: AEDT (UTC+11). July: AEST (UTC+10).
    expect(tzOffsetMinutes("Australia/Sydney", Date.UTC(2025, 0, 15, 0, 0))).toBe(660);
    expect(tzOffsetMinutes("Australia/Sydney", Date.UTC(2025, 6, 15, 0, 0))).toBe(600);
    // New York: EST in January (UTC-5), EDT in July (UTC-4).
    expect(tzOffsetMinutes("America/New_York", Date.UTC(2025, 0, 15, 12))).toBe(-300);
    expect(tzOffsetMinutes("America/New_York", Date.UTC(2025, 6, 15, 12))).toBe(-240);
  });

  it("converts local session times to UTC across DST", () => {
    // ASX open 10:00 AEDT on 15 Jan 2025 is 23:00 UTC the previous day.
    expect(zonedToUtc("Australia/Sydney", 2025, 1, 15, 10, 0)).toBe(Date.UTC(2025, 0, 14, 23, 0));
    // ASX open 10:00 AEST on 15 Jul 2025 is 00:00 UTC same day.
    expect(zonedToUtc("Australia/Sydney", 2025, 7, 15, 10, 0)).toBe(Date.UTC(2025, 6, 15, 0, 0));
    // NYSE open 09:30 EST on 15 Jan 2025 is 14:30 UTC.
    expect(zonedToUtc("America/New_York", 2025, 1, 15, 9, 30)).toBe(Date.UTC(2025, 0, 15, 14, 30));
    const p = localParts("Australia/Sydney", Date.UTC(2025, 0, 14, 23, 0));
    expect([p.year, p.month, p.day, p.hour]).toEqual([2025, 1, 15, 10]);
  });
});

describe("holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2025)).toEqual([4, 20]);
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2024)).toEqual([3, 31]);
  });

  it("knows ASX holidays in 2025 and 2026", () => {
    const h25 = asxHolidays(2025);
    expect(h25.has("2025-01-01")).toBe(true);
    expect(h25.has("2025-01-27")).toBe(true); // Australia Day observed (26 Jan is Sunday)
    expect(h25.has("2025-04-18")).toBe(true); // Good Friday
    expect(h25.has("2025-04-21")).toBe(true); // Easter Monday
    expect(h25.has("2025-04-25")).toBe(true); // Anzac Day (Friday)
    expect(h25.has("2025-06-09")).toBe(true); // King's Birthday
    expect(h25.has("2025-12-25")).toBe(true);
    expect(h25.has("2025-12-26")).toBe(true);
    const h26 = asxHolidays(2026);
    expect(h26.has("2026-01-26")).toBe(true); // Monday
    expect(h26.has("2026-04-03")).toBe(true); // Good Friday
    expect(h26.has("2026-04-25")).toBe(false); // Anzac Day on Saturday: no substitute
    expect(h26.has("2026-12-25")).toBe(true);
    expect(h26.has("2026-12-28")).toBe(true); // Boxing Day (Saturday) observed Monday
  });

  it("knows NYSE holidays", () => {
    const h = nyseHolidays(2025);
    expect(h.has("2025-01-01")).toBe(true);
    expect(h.has("2025-01-20")).toBe(true); // MLK
    expect(h.has("2025-02-17")).toBe(true); // Presidents' Day
    expect(h.has("2025-04-18")).toBe(true); // Good Friday
    expect(h.has("2025-05-26")).toBe(true); // Memorial Day
    expect(h.has("2025-06-19")).toBe(true); // Juneteenth
    expect(h.has("2025-07-04")).toBe(true);
    expect(h.has("2025-09-01")).toBe(true); // Labor Day
    expect(h.has("2025-11-27")).toBe(true); // Thanksgiving
    expect(h.has("2025-12-25")).toBe(true);
    expect(nyseHolidays(2026).has("2026-07-03")).toBe(true); // 4 July on Saturday observed Friday
  });
});

describe("sessions", () => {
  it("has no sessions on weekends or holidays and correct bar times", () => {
    expect(isTradingDate("ASX", 2025, 4, 25)).toBe(false);
    expect(isTradingDate("ASX", 2025, 4, 24)).toBe(true);
    expect(sessionFor("ASX", 2025, 1, 4)).toBeNull(); // Saturday
    const s = sessionFor("ASX", 2025, 7, 15)!;
    expect(s.openUtc).toBe(Date.UTC(2025, 6, 15, 0, 0));
    expect(s.closeUtc).toBe(Date.UTC(2025, 6, 15, 6, 0));
    expect(sessionBarTimes(s, "1h")).toHaveLength(6);
    expect(sessionBarTimes(s, "4h")).toHaveLength(2);
    expect(sessionBarTimes(s, "1d")).toEqual([s.openUtc]);
    const us = sessionFor("US", 2025, 1, 15)!;
    expect(sessionBarTimes(us, "1h")).toHaveLength(7); // 09:30 .. 15:30 (last bar is 30 minutes)
  });

  it("lists trading sessions in a range and counts about 252 per year", () => {
    const sessions = tradingSessions("ASX", Date.UTC(2025, 0, 1), Date.UTC(2025, 11, 31, 23));
    expect(sessions.length).toBeGreaterThanOrEqual(250);
    expect(sessions.length).toBeLessThanOrEqual(254);
    for (let i = 1; i < sessions.length; i++) expect(sessions[i].openUtc).toBeGreaterThan(sessions[i - 1].openUtc);
    expect(tradingSessions("CRYPTO", Date.UTC(2025, 0, 1), Date.UTC(2025, 0, 10)).length).toBe(10);
  });

  it("annualises by market", () => {
    expect(barsPerYear("ASX", "1d")).toBe(252);
    expect(barsPerYear("ASX", "1h")).toBe(1512);
    expect(barsPerYear("US", "1h")).toBe(1764);
    expect(barsPerYear("CRYPTO", "1h")).toBe(8760);
    expect(barsPerYear("CRYPTO", "1d")).toBe(365);
  });

  it("reports market status", () => {
    // Tuesday 15 July 2025 02:00 UTC = 12:00 AEST: ASX open.
    const open = marketStatus("ASX", Date.UTC(2025, 6, 15, 2, 0));
    expect(open.state).toBe("open");
    // Saturday
    const closed = marketStatus("ASX", Date.UTC(2025, 6, 12, 2, 0));
    expect(closed.state).toBe("closed");
    if (closed.state === "closed") expect(closed.reason).toBe("weekend");
    expect(marketStatus("CRYPTO").state).toBe("always_open");
  });
});
