export type ChartMode = "portfolio" | "twr" | "mwr" | "drawdown";

export interface ChartSeriesPoint {
  date: string;
  [key: string]: string | number | null | undefined;
}

export interface BenchmarkSeriesPoint {
  date: string;
  return_pct: number;
  drawdown_pct: number;
  mwr_pct: number;
}

export interface BenchmarkSeries {
  ticker: string;
  label: string;
  color: string;
  data: BenchmarkSeriesPoint[];
}

export interface ChartDataset {
  points: ChartSeriesPoint[];
  hasData: boolean;
}

export interface BenchmarkKeyNames {
  returnKey: (token: string) => string;
  drawdownKey: (token: string) => string;
  mwrKey?: (token: string) => string;
}
