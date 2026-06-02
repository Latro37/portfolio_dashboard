import { describe, expect, it } from "vitest";

import type { PerformancePoint } from "@/lib/api";
import { buildLivePerformanceOverlay } from "@/features/symphony-detail/hooks/symphonyLiveOverlay";

const point = (
  overrides: Partial<PerformancePoint> & Pick<PerformancePoint, "date">,
): PerformancePoint => ({
  date: overrides.date,
  portfolio_value: overrides.portfolio_value ?? 100,
  net_deposits: overrides.net_deposits ?? 100,
  cumulative_return_pct: overrides.cumulative_return_pct ?? 0,
  daily_return_pct: overrides.daily_return_pct ?? 0,
  time_weighted_return: overrides.time_weighted_return ?? 0,
  money_weighted_return: overrides.money_weighted_return ?? 0,
  current_drawdown: overrides.current_drawdown ?? 0,
});

describe("symphony live overlay", () => {
  it("does not count a same-day deposit as TWR when appending today", () => {
    const result = buildLivePerformanceOverlay({
      base: [point({ date: "2026-06-01", portfolio_value: 100, net_deposits: 100 })],
      livePv: 150,
      liveNd: 150,
      today: "2026-06-02",
    });

    expect(result).toHaveLength(2);
    expect(result[1].daily_return_pct).toBeCloseTo(0, 6);
    expect(result[1].time_weighted_return).toBeCloseTo(0, 6);
    expect(result[1].net_deposits).toBe(150);
  });

  it("replaces today's stored row using yesterday as the return baseline", () => {
    const result = buildLivePerformanceOverlay({
      base: [
        point({ date: "2026-06-01", portfolio_value: 100, net_deposits: 100 }),
        point({
          date: "2026-06-02",
          portfolio_value: 101,
          net_deposits: 100,
          daily_return_pct: 1,
          time_weighted_return: 1,
        }),
      ],
      livePv: 150,
      liveNd: 150,
      today: "2026-06-02",
    });

    expect(result).toHaveLength(2);
    expect(result[1].daily_return_pct).toBeCloseTo(0, 6);
    expect(result[1].time_weighted_return).toBeCloseTo(0, 6);
    expect(result[1].portfolio_value).toBe(150);
    expect(result[1].net_deposits).toBe(150);
  });

  it("preserves actual market return after adjusting for a deposit", () => {
    const result = buildLivePerformanceOverlay({
      base: [point({ date: "2026-06-01", portfolio_value: 100, net_deposits: 100 })],
      livePv: 151,
      liveNd: 150,
      today: "2026-06-02",
    });

    expect(result[1].daily_return_pct).toBeCloseTo(1, 6);
    expect(result[1].time_weighted_return).toBeCloseTo(1, 6);
    expect(result[1].cumulative_return_pct).toBeCloseTo(0.6666667, 6);
  });
});
