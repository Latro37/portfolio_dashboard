import { describe, expect, it } from "vitest";

import type { PerformancePoint } from "@/lib/api";
import { mergeLiveData } from "@/features/symphony-detail/hooks/symphonyChartSeriesTransforms";

describe("symphony chart series transforms", () => {
  it("rebases live TWR and MWR from the first visible point", () => {
    const liveData: PerformancePoint[] = [
      {
        date: "2025-01-02",
        portfolio_value: 100,
        net_deposits: 100,
        cumulative_return_pct: 0,
        daily_return_pct: 0,
        time_weighted_return: 5,
        money_weighted_return: 4,
        current_drawdown: -2,
      },
      {
        date: "2025-01-03",
        portfolio_value: 104,
        net_deposits: 100,
        cumulative_return_pct: 4,
        daily_return_pct: 4,
        time_weighted_return: 10,
        money_weighted_return: 8,
        current_drawdown: 0,
      },
    ];

    const merged = mergeLiveData(liveData, []);

    expect(merged).toHaveLength(2);
    expect(Number(merged[0].time_weighted_return)).toBe(0);
    expect(Number(merged[0].money_weighted_return)).toBe(0);
    expect(Number(merged[0].current_drawdown)).toBe(0);

    expect(Number(merged[1].time_weighted_return)).toBeCloseTo(4.7619, 4);
    expect(Number(merged[1].money_weighted_return)).toBeCloseTo(3.8462, 4);
    expect(Number(merged[1].current_drawdown)).toBe(0);
  });
});
