"use client";

import {
  Area,
  AreaChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BenchmarkEntry } from "@/lib/api";
import { createOverlayTooltipRenderer } from "@/features/charting/performanceChartTooltips";
import type { ChartMode } from "@/features/charting/types";
import { formatPctAxis } from "@/features/symphony-detail/utils";

type BacktestChartPoint = {
  date: string;
  value: number;
  twr: number;
  drawdown: number;
  [key: string]: number | string | null | undefined;
};

type Props = {
  chartMode: ChartMode;
  loadingBacktest: boolean;
  filteredBacktestData: BacktestChartPoint[];
  mergedBacktestData: BacktestChartPoint[];
  btFormatDate: (d: string) => string;
  backtestTwrOffset: number;
  showLiveOverlay: boolean;
  onToggleLiveOverlay: () => void;
  benchmarks: BenchmarkEntry[];
};

export function SymphonyBacktestChartPanel({
  chartMode,
  loadingBacktest,
  filteredBacktestData,
  mergedBacktestData,
  btFormatDate,
  backtestTwrOffset,
  showLiveOverlay,
  onToggleLiveOverlay,
  benchmarks,
}: Props) {
  if (loadingBacktest) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!filteredBacktestData.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No backtest data available
      </div>
    );
  }

  const tooltipFormatters = {
    formatDate: btFormatDate,
    formatValue: formatPctAxis,
    formatPct: formatPctAxis,
  };
  const sharedTooltipArgs = {
    tradingData: mergedBacktestData,
    benchmarks,
    singleBenchmark: benchmarks.length === 1,
    showOverlay: showLiveOverlay,
    overlayColor: "#f59e0b",
    overlayLabel: "Live",
    primaryLabelWhenOverlay: "Backtest",
    formatters: tooltipFormatters,
  };
  const backtestTwrTooltip = createOverlayTooltipRenderer({
    ...sharedTooltipArgs,
    primaryKey: "twr",
    primaryLabel: "Return",
    overlayKey: "liveTwr",
    benchmarkSuffix: "return",
  });
  const backtestDrawdownTooltip = createOverlayTooltipRenderer({
    ...sharedTooltipArgs,
    primaryKey: "drawdown",
    primaryLabel: "Drawdown",
    overlayKey: "liveDrawdown",
    benchmarkSuffix: "drawdown",
  });

  if (chartMode !== "drawdown") {
    return (
      <>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={mergedBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="btTwrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                <stop offset={backtestTwrOffset} stopColor="#10b981" stopOpacity={0.05} />
                <stop offset={backtestTwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="btTwrStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={backtestTwrOffset} stopColor="#10b981" />
                <stop offset={backtestTwrOffset} stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={btFormatDate}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={formatPctAxis}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Tooltip content={backtestTwrTooltip} />
            <Area
              type="monotone"
              dataKey="twr"
              stroke="url(#btTwrStroke)"
              strokeWidth={2}
              fill="url(#btTwrGrad)"
              dot={false}
            />
            {showLiveOverlay && (
              <Line
                type="monotone"
                dataKey="liveTwr"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
            )}
            {benchmarks.map((benchmark, i) => (
              <Line
                key={`bt-bench-twr-${i}`}
                type="monotone"
                dataKey={`bench_${i}_return`}
                stroke={benchmark.color}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-400 cursor-default">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#10b981" }} />
            Backtest
          </button>
          <button
            onClick={onToggleLiveOverlay}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              showLiveOverlay ? "text-amber-400" : "text-muted-foreground/40 line-through"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: showLiveOverlay ? "#f59e0b" : "#71717a" }}
            />
            Live
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={mergedBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="btDdGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={btFormatDate}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatPctAxis}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={backtestDrawdownTooltip} />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#btDdGrad)"
            baseValue={0}
            dot={false}
          />
          {showLiveOverlay && (
            <Line
              type="monotone"
              dataKey="liveDrawdown"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          )}
          {benchmarks.map((benchmark, i) => (
            <Line
              key={`bt-bench-dd-${i}`}
              type="monotone"
              dataKey={`bench_${i}_drawdown`}
              stroke={benchmark.color}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-400 cursor-default">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
          Backtest
        </button>
        <button
          onClick={onToggleLiveOverlay}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
            showLiveOverlay ? "text-amber-400" : "text-muted-foreground/40 line-through"
          }`}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: showLiveOverlay ? "#f59e0b" : "#71717a" }}
          />
          Live
        </button>
      </div>
    </>
  );
}
