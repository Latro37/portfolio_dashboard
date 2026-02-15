import { describe, expect, it } from "vitest";

import { mergeBenchmarksByTicker, mergeBenchmarksIndexed } from "./benchmark";
import { calcGradientOffset, filterTradingDays } from "./transforms";
import type { BenchmarkSeries, ChartSeriesPoint } from "./types";

describe("chart transforms", () => {
  it("filters out weekend dates", () => {
    const points = [
      { date: "2025-01-03", value: 1 }, // Friday
      { date: "2025-01-04", value: 2 }, // Saturday
      { date: "2025-01-05", value: 3 }, // Sunday
      { date: "2025-01-06", value: 4 }, // Monday
    ];
    const filtered = filterTradingDays(points);
    expect(filtered.map((p) => p.date)).toEqual(["2025-01-03", "2025-01-06"]);
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
