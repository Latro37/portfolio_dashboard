import type { BenchmarkEntry, PerformancePoint } from "@/lib/api";
import { adaptPortfolioChart } from "./portfolioChartAdapter";
import type { ChartDataset } from "./types";

export function adaptSymphonyLiveChart(
  data: PerformancePoint[],
  benchmarks: BenchmarkEntry[] = [],
): ChartDataset {
  return adaptPortfolioChart(data, benchmarks);
}
