"use client";

import { colorVal } from "@/features/symphony-detail/utils";

export type BacktestMetricsView = {
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

type Props = {
  btMetrics: BacktestMetricsView;
  show: boolean;
};

export function BacktestMetricsSummary({ btMetrics, show }: Props) {
  if (!show) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Backtest Metrics
        {btMetrics.startDate && btMetrics.endDate && (
          <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">
            {new Date(`${btMetrics.startDate}T00:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {" - "}
            {new Date(`${btMetrics.endDate}T00:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 text-xs">
        {btMetrics.cumReturn != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Cum. Return</span>
            <span className={`ml-1 font-medium ${colorVal(btMetrics.cumReturn)}`}>
              {(btMetrics.cumReturn * 100).toFixed(2)}%
            </span>
          </div>
        )}
        {btMetrics.annualized != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Annualized</span>
            <span className={`ml-1 font-medium ${colorVal(btMetrics.annualized)}`}>
              {(btMetrics.annualized * 100).toFixed(2)}%
            </span>
          </div>
        )}
        {btMetrics.sharpe != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Sharpe</span>
            <span className="ml-1 font-medium">{btMetrics.sharpe.toFixed(2)}</span>
          </div>
        )}
        {btMetrics.sortino != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Sortino</span>
            <span className="ml-1 font-medium">{btMetrics.sortino.toFixed(2)}</span>
          </div>
        )}
        {btMetrics.calmar != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Calmar</span>
            <span className="ml-1 font-medium">{btMetrics.calmar.toFixed(2)}</span>
          </div>
        )}
        {btMetrics.maxDrawdown != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Max DD</span>
            <span className="ml-1 font-medium text-red-400">
              {(btMetrics.maxDrawdown * 100).toFixed(2)}%
            </span>
          </div>
        )}
        {btMetrics.medianDrawdown != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Median DD</span>
            <span className="ml-1 font-medium text-red-400">
              {(btMetrics.medianDrawdown * 100).toFixed(2)}%
            </span>
          </div>
        )}
        {btMetrics.longestDrawdownDays != null && btMetrics.longestDrawdownDays > 0 && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Longest DD</span>
            <span className="ml-1 font-medium">{btMetrics.longestDrawdownDays}d</span>
          </div>
        )}
        {btMetrics.medianDrawdownDays != null && btMetrics.medianDrawdownDays > 0 && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Median DD Length</span>
            <span className="ml-1 font-medium">{btMetrics.medianDrawdownDays}d</span>
          </div>
        )}
        {btMetrics.winRate != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Win Rate</span>
            <span className="ml-1 font-medium">{(btMetrics.winRate * 100).toFixed(1)}%</span>
          </div>
        )}
        {btMetrics.volatility != null && (
          <div className="rounded bg-muted/40 px-2 py-1.5">
            <span className="text-muted-foreground">Volatility</span>
            <span className="ml-1 font-medium">{(btMetrics.volatility * 100).toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
