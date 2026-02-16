import type { BenchmarkEntry, PerformancePoint } from "@/lib/api";
import { mergeBenchmarksIndexed } from "./benchmark";
import { filterTradingDays } from "./transforms";
import type { TradingDayEvidence } from "./tradingCalendar";
import type { BenchmarkSeries, ChartDataset, ChartSeriesPoint } from "./types";

export function adaptPortfolioChart(
  data: PerformancePoint[],
  benchmarks: BenchmarkEntry[] = [],
  tradingDayEvidence: TradingDayEvidence = {},
): ChartDataset {
  const basePoints = filterTradingDays(data as unknown as ChartSeriesPoint[], tradingDayEvidence);
  const points = mergeBenchmarksIndexed(basePoints, benchmarks as unknown as BenchmarkSeries[]);
  return { points, hasData: points.length > 0 };
}
