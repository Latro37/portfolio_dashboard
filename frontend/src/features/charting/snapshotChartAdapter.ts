import type { BenchmarkPoint, PerformancePoint } from "@/lib/api";
import { mergeBenchmarksByTicker } from "./benchmark";
import { filterTradingDays } from "./transforms";
import type { BenchmarkSeries, ChartDataset, ChartSeriesPoint } from "./types";

type SnapshotBenchmark = {
  ticker: string;
  data: BenchmarkPoint[];
  color: string;
};

export function adaptSnapshotChart(
  data: PerformancePoint[],
  benchmarks: SnapshotBenchmark[] = [],
): ChartDataset {
  const normalized: BenchmarkSeries[] = benchmarks.map((bench) => ({
    ticker: bench.ticker,
    label: bench.ticker,
    color: bench.color,
    data: bench.data,
  }));
  const basePoints = filterTradingDays(data as unknown as ChartSeriesPoint[]);
  const points = mergeBenchmarksByTicker(basePoints, normalized);
  return { points, hasData: points.length > 0 };
}
