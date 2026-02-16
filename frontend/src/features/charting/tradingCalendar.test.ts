import { describe, expect, it } from "vitest";

import { isUsEquityTradingDay } from "./tradingCalendar";

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
});
