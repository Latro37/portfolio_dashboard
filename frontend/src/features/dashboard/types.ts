import type { SnapshotBenchmark } from "@/features/dashboard/snapshot/types";
import type { PerformancePoint, Summary } from "@/lib/api";

export type DashboardPeriod = "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export type DashboardPeriodReturns = {
  "1W"?: number;
  "1M"?: number;
  "YTD"?: number;
};

export type DashboardSnapshotData = {
  perf: PerformancePoint[];
  sum: Summary;
  periodReturns?: DashboardPeriodReturns;
  benchmarks?: SnapshotBenchmark[];
};
