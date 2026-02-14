import type { BenchmarkEntry, PerformancePoint } from "@/lib/api";
import { mergeBenchmarksIndexed } from "./benchmark";
import { filterTradingDays } from "./transforms";
import type { BenchmarkSeries, ChartDataset, ChartSeriesPoint } from "./types";

export function adaptPortfolioChart(
  data: PerformancePoint[],
  benchmarks: BenchmarkEntry[] = [],
): ChartDataset {
  const basePoints = filterTradingDays(data as unknown as ChartSeriesPoint[]);
  const points = mergeBenchmarksIndexed(basePoints, benchmarks as unknown as BenchmarkSeries[]);
  return { points, hasData: points.length > 0 };
}
