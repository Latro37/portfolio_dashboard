import { afterEach, describe, expect, it, vi } from "vitest";

import { isAfterClose, isMarketOpen, isWithinTradingSession, todayET } from "@/lib/marketHours";

describe("marketHours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats NYSE holidays as closed even during normal clock hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T15:00:00Z")); // 10:00 AM ET, Presidents Day

    expect(todayET()).toBe("2026-02-16");
    expect(isMarketOpen()).toBe(false);
    expect(isWithinTradingSession()).toBe(false);
    expect(isAfterClose()).toBe(false);
  });

  it("treats regular trading days as open during session and closed after hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T15:00:00Z")); // 10:00 AM ET, regular Friday

    expect(todayET()).toBe("2026-02-13");
    expect(isMarketOpen()).toBe(true);
    expect(isWithinTradingSession()).toBe(true);
    expect(isAfterClose()).toBe(false);

    vi.setSystemTime(new Date("2026-02-13T21:30:00Z")); // 4:30 PM ET
    expect(isMarketOpen()).toBe(false);
    expect(isWithinTradingSession()).toBe(false);
    expect(isAfterClose()).toBe(true);
  });
});

