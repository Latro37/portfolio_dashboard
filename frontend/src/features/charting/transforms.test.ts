import { describe, expect, it } from "vitest";

import { mergeBenchmarksByTicker, mergeBenchmarksIndexed } from "./benchmark";
import { calcGradientOffset, filterTradingDays } from "./transforms";
import type { BenchmarkSeries, ChartSeriesPoint } from "./types";

describe("chart transforms", () => {
  it("filters out weekends and full-market holidays while keeping early closes", () => {
    const points = [
      { date: "2026-02-13", value: 1 }, // Friday
      { date: "2026-02-14", value: 2 }, // Saturday
      { date: "2026-02-15", value: 3 }, // Sunday
      { date: "2026-02-16", value: 4 }, // Presidents Day (market closed)
      { date: "2026-02-17", value: 5 }, // Tuesday
      { date: "2026-11-27", value: 6 }, // Day after Thanksgiving (early close)
    ];
    const filtered = filterTradingDays(points);
    expect(filtered.map((p) => p.date)).toEqual(["2026-02-13", "2026-02-17", "2026-11-27"]);
  });

  it("uses observed sessions to remove one-off closures", () => {
    const points = [
      { date: "1994-04-26", value: 1 },
      { date: "1994-04-27", value: 2 }, // Nixon funeral closure
      { date: "1994-04-28", value: 3 },
    ];
    const filtered = filterTradingDays(points, {
      observedTradingDates: new Set(["1994-04-26", "1994-04-28"]),
      observedStartDate: "1994-04-26",
      observedEndDate: "1994-04-28",
    });
    expect(filtered.map((p) => p.date)).toEqual(["1994-04-26", "1994-04-28"]);
  });

  it("merges benchmark returns/drawdowns with indexed keys", () => {
    const base: ChartSeriesPoint[] = [
      { date: "2025-01-02" },
      { date: "2025-01-03" },
      { date: "2025-01-06" },
      { date: "2025-01-07" },
      { date: "2025-01-08" }, // carries last benchmark state
    ];
    const benchmarks: BenchmarkSeries[] = [
      {
        ticker: "SPY",
        label: "SPY",
        color: "#fff",
        data: [
          { date: "2025-01-03", return_pct: 10, drawdown_pct: 0, mwr_pct: 11 },
          { date: "2025-01-06", return_pct: 20, drawdown_pct: 0, mwr_pct: 0 },
          { date: "2025-01-07", return_pct: 0, drawdown_pct: -5, mwr_pct: 0 },
        ],
      },
    ];

    const merged = mergeBenchmarksIndexed(base, benchmarks);
    expect(merged[0]["bench_0_return"]).toBeUndefined();
    expect(merged[1]["bench_0_return"]).toBe(0);
    expect(Number(merged[2]["bench_0_return"])).toBeCloseTo(9.0909, 4);
    expect(Number(merged[3]["bench_0_drawdown"])).toBeCloseTo(-16.6667, 4);
    expect(Number(merged[4]["bench_0_drawdown"])).toBeCloseTo(-16.6667, 4);
    expect(Number(merged[1]["bench_0_mwr"])).toBe(11);
    expect(Number(merged[2]["bench_0_mwr"])).toBeCloseTo(9.0909, 4);
  });

  it("merges benchmark series using ticker keys for snapshot mode", () => {
    const base: ChartSeriesPoint[] = [{ date: "2025-01-03" }];
    const benchmarks: BenchmarkSeries[] = [
      {
        ticker: "QQQ",
        label: "QQQ",
        color: "#fff",
        data: [{ date: "2025-01-03", return_pct: 10, drawdown_pct: 0, mwr_pct: 10 }],
      },
    ];
    const merged = mergeBenchmarksByTicker(base, benchmarks);
    expect(merged[0]["bench_QQQ"]).toBe(0);
    expect(merged[0]["bench_QQQ_dd"]).toBe(0);
    expect(merged[0]["bench_QQQ_mwr"]).toBeUndefined();
  });

  it("computes gradient offsets for negative, positive, and mixed ranges", () => {
    expect(calcGradientOffset([{ date: "a", value: -2 }, { date: "b", value: -1 }], "value")).toBe(0);
    expect(calcGradientOffset([{ date: "a", value: 2 }, { date: "b", value: 1 }], "value")).toBe(1);
    expect(calcGradientOffset([{ date: "a", value: -1 }, { date: "b", value: 3 }], "value")).toBe(0.75);
  });
});
