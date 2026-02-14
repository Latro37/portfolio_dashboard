import type { PerformancePoint } from "@/lib/api";

export type BacktestChartPoint = {
  date: string;
  value: number;
  twr: number;
  drawdown: number;
  [key: string]: number | string | null | undefined;
};

export type LiveChartPoint = PerformancePoint & {
  [key: string]: number | string | null | undefined;
};

export type SymphonyLiveMetricsView = {
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  maxDrawdownDate: string;
  annualized: number | null;
  calmar: number | null;
  winRate: number | null;
  bestDay: number | null;
  worstDay: number | null;
  bestDayDate: string;
  worstDayDate: string;
  cumReturn: number | null;
  twr: number | null;
  mwr: number | null;
  totalReturn: number | null;
  startDate: string;
  endDate: string;
};

export type SymphonyBacktestMetricsView = {
  cumReturn: number | null;
  annualized: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number | null;
  medianDrawdown: number | null;
  longestDrawdownDays: number | null;
  medianDrawdownDays: number | null;
  winRate: number | null;
  volatility: number | null;
  startDate: string;
  endDate: string;
};
