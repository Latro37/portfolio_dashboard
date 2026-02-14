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
import type { ChartMode } from "@/features/charting/types";
import { formatPctAxis, toFiniteNumber } from "@/features/symphony-detail/utils";

type TooltipEntry = {
  dataKey?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
};

type BacktestChartPoint = {
  date: string;
  value: number;
  twr: number;
  drawdown: number;
  [key: string]: number | string | null | undefined;
};

const deltaColor = (delta: number) => (delta >= 0 ? "#10b981" : "#ef4444");
const formatDelta = (delta: number) => (delta >= 0 ? "+" : "") + formatPctAxis(delta);

function backtestOverlayTooltip(
  primaryKey: string,
  primaryLabel: string,
  overlayKey: string,
  overlayLabel: string,
  showOverlay: boolean,
  formatDate: (d: string) => string,
  chartData: BacktestChartPoint[],
  benchSuffix: string,
  activeBenchmarks: BenchmarkEntry[],
) {
  function BacktestOverlayTooltipContent({
    active,
    payload,
    label,
  }: ChartTooltipProps) {
    if (!active || !payload?.length || label == null) return null;

    const labelText = String(label);
    const idx = chartData.findIndex((point) => point.date === labelText);
    const prev = idx > 0 ? chartData[idx - 1] : null;
    const primaryEntry = payload.find((entry) => entry.dataKey === primaryKey);
    const overlayEntry = payload.find((entry) => entry.dataKey === overlayKey);
    const primaryVal = toFiniteNumber(primaryEntry?.value);
    const overlayVal = toFiniteNumber(overlayEntry?.value);
    const hasBoth = primaryVal != null && overlayVal != null;
    const delta = hasBoth ? primaryVal - overlayVal : null;
    const prevPrimary = prev ? toFiniteNumber(prev[primaryKey]) : null;
    const dailyDelta = primaryVal != null && prevPrimary != null ? primaryVal - prevPrimary : null;
    const dailyDeltaColor = dailyDelta != null ? deltaColor(dailyDelta) : "#71717a";
    const totalDeltaColor = delta != null ? deltaColor(delta) : "#71717a";
    const hasBenchmark = activeBenchmarks.length > 0;
    const singleBenchmark = activeBenchmarks.length === 1;

    return (
      <div
        key={labelText}
        style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: 8,
          fontSize: 13,
          padding: "10px 14px",
        }}
      >
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{formatDate(labelText)}</p>
        {primaryVal != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>
              {showOverlay ? "Backtest" : primaryLabel} : {formatPctAxis(primaryVal)}
            </p>
            {!showOverlay && !hasBenchmark && dailyDelta != null && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: dailyDeltaColor,
                }}
              >
                Δ to Prev. Day: {formatDelta(dailyDelta)}
              </p>
            )}
          </div>
        )}
        {showOverlay && overlayVal != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#f59e0b" }}>
              {overlayLabel} : {formatPctAxis(overlayVal)}
            </p>
          </div>
        )}
        {showOverlay && delta != null && (
          <p style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: totalDeltaColor }}>
            Δ: {formatDelta(delta)}
          </p>
        )}
        {activeBenchmarks.map((benchmark, i) => {
          const benchmarkEntry = payload.find(
            (entry) => entry.dataKey === `bench_${i}_${benchSuffix}`,
          );
          const benchmarkValue = toFiniteNumber(benchmarkEntry?.value);
          if (benchmarkValue == null) return null;
          return (
            <div key={benchmark.ticker}>
              <p style={{ margin: 0, lineHeight: 1.6, color: benchmark.color }}>
                {benchmark.label} : {formatPctAxis(benchmarkValue)}
              </p>
              {singleBenchmark && primaryVal != null && (
                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.6,
                    marginTop: 2,
                    color: primaryVal - benchmarkValue >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  Δ: {formatDelta(primaryVal - benchmarkValue)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return BacktestOverlayTooltipContent;
}

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
            <Tooltip
              content={backtestOverlayTooltip(
                "twr",
                "Return",
                "liveTwr",
                "Live",
                showLiveOverlay,
                btFormatDate,
                mergedBacktestData,
                "return",
                benchmarks,
              )}
            />
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
          <Tooltip
            content={backtestOverlayTooltip(
              "drawdown",
              "Drawdown",
              "liveDrawdown",
              "Live",
              showLiveOverlay,
              btFormatDate,
              mergedBacktestData,
              "drawdown",
              benchmarks,
            )}
          />
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
