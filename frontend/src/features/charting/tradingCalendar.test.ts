import { describe, expect, it } from "vitest";

import { isUsEquityTradingDay } from "./tradingCalendar";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekdayIsoDatesInYear(year: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(Date.UTC(year, 0, 1));
  while (cursor.getUTCFullYear() === year) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      dates.push(toIsoDate(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

describe("tradingCalendar", () => {
  it("excludes weekends", () => {
    expect(isUsEquityTradingDay("2026-02-14")).toBe(false);
    expect(isUsEquityTradingDay("2026-02-15")).toBe(false);
  });

  it("excludes recurring full-market holidays", () => {
    expect(isUsEquityTradingDay("2026-02-16")).toBe(false); // Presidents Day
    expect(isUsEquityTradingDay("2024-03-29")).toBe(false); // Good Friday
    expect(isUsEquityTradingDay("2026-12-25")).toBe(false); // Christmas Day
  });

  it("applies MLK holiday only from 1998 onward", () => {
    expect(isUsEquityTradingDay("1997-01-20")).toBe(true); // Third Monday Jan before NYSE observance
    expect(isUsEquityTradingDay("1998-01-19")).toBe(false); // First NYSE MLK closure year
  });

  it("handles observed fixed-date holidays", () => {
    expect(isUsEquityTradingDay("2021-12-31")).toBe(false); // 2022 New Year's Day observed
    expect(isUsEquityTradingDay("2027-06-18")).toBe(false); // Juneteenth observed
  });

  it("keeps partial trading sessions", () => {
    expect(isUsEquityTradingDay("2025-11-28")).toBe(true); // Day after Thanksgiving
    expect(isUsEquityTradingDay("2024-07-03")).toBe(true); // Typical early close date
  });

  it("matches NYSE published 2026 closures and early closes", () => {
    // Source checked once: https://www.nyse.com/trade/hours-calendars (accessed 2026-02-16)
    // Full-day closures for 2026:
    const nyseClosed2026 = [
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ];
    for (const date of nyseClosed2026) {
      expect(isUsEquityTradingDay(date)).toBe(false);
    }

    // Early-close dates should still be treated as trading days.
    expect(isUsEquityTradingDay("2026-11-27")).toBe(true);
    expect(isUsEquityTradingDay("2026-12-24")).toBe(true);
  });

  it("matches authoritative 1994 holiday closures when observed sessions are provided", () => {
    // NYSE 1994 full-day closures (authoritative holiday list + one-off closure):
    // Presidents Day, Good Friday, Nixon funeral, Memorial Day, Independence Day,
    // Labor Day, Thanksgiving, Christmas observed.
    const nyseClosed1994 = new Set([
      "1994-02-21",
      "1994-04-01",
      "1994-04-27",
      "1994-05-30",
      "1994-07-04",
      "1994-09-05",
      "1994-11-24",
      "1994-12-26",
    ]);
    const weekdays1994 = weekdayIsoDatesInYear(1994);
    const spyObservedSessions = new Set(
      weekdays1994.filter((date) => !nyseClosed1994.has(date)),
    );

    for (const date of weekdays1994) {
      const expectedTrading = !nyseClosed1994.has(date);
      expect(
        isUsEquityTradingDay(date, {
          observedTradingDates: spyObservedSessions,
          observedStartDate: "1994-01-03",
          observedEndDate: "1994-12-30",
        }),
      ).toBe(expectedTrading);
    }
  });
});
