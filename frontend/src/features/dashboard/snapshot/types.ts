import type { BenchmarkPoint } from "@/lib/api";

export type SnapshotChartMode = "portfolio" | "twr" | "mwr" | "drawdown";

export type SnapshotPeriodReturns = {
  "1W"?: number;
  "1M"?: number;
  "YTD"?: number;
};

export type SnapshotMetricOption = {
  key: string;
  label: string;
};

export type SnapshotMetricCard = {
  label: string;
  value: string;
  color: string;
};

export interface SnapshotBenchmark {
  ticker: string;
  data: BenchmarkPoint[];
  color: string;
}
