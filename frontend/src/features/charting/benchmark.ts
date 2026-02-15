import type { BenchmarkSeries, ChartSeriesPoint } from "./types";
import { mergeBenchmarkSeries } from "./transforms";

export function mergeBenchmarksIndexed(
  points: ChartSeriesPoint[],
  benchmarks: BenchmarkSeries[],
): ChartSeriesPoint[] {
  return mergeBenchmarkSeries(points, benchmarks, (_bench, idx) => String(idx));
}

export function mergeBenchmarksByTicker(
  points: ChartSeriesPoint[],
  benchmarks: BenchmarkSeries[],
): ChartSeriesPoint[] {
  return mergeBenchmarkSeries(
    points,
    benchmarks,
    (bench) => bench.ticker,
    {
      returnKey: (token) => `bench_${token}`,
      drawdownKey: (token) => `bench_${token}_dd`,
    },
  );
}
