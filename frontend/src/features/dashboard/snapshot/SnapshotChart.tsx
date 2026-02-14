import {
  Area,
  AreaChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { PerformancePoint } from "@/lib/api";
import { calcGradientOffset } from "@/features/charting/transforms";
import type {
  SnapshotBenchmark,
  SnapshotChartMode,
} from "@/features/dashboard/snapshot/types";

type Props = {
  tradingData: (PerformancePoint & Record<string, number>)[];
  hasData: boolean;
  chartMode: SnapshotChartMode;
  benchmarks: SnapshotBenchmark[];
};

function createDateFormatter(data: (PerformancePoint & Record<string, number>)[], hasData: boolean) {
  const multiYear =
    hasData &&
    new Date(data[0].date + "T00:00:00").getFullYear() !==
      new Date(data[data.length - 1].date + "T00:00:00").getFullYear();

  return (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    if (multiYear) {
      const year = String(date.getFullYear()).slice(-2);
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " '" +
        year
      );
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}

function formatDollarAxis(value: number) {
  return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercentAxis(value: number) {
  return value.toFixed(1) + "%";
}

export function SnapshotChart({
  tradingData,
  hasData,
  chartMode,
  benchmarks,
}: Props) {
  const formatDate = createDateFormatter(tradingData, hasData);
  const twrOffset = calcGradientOffset(tradingData, "time_weighted_return");
  const mwrOffset = calcGradientOffset(tradingData, "money_weighted_return");

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      {!hasData ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#71717a",
            fontSize: 14,
          }}
        >
          No data
        </div>
      ) : chartMode === "portfolio" ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="snap-pvGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="snap-depGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              tickFormatter={formatDollarAxis}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Area
              type="monotone"
              dataKey="net_deposits"
              stroke="#6366f1"
              strokeWidth={1.5}
              fill="url(#snap-depGrad)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="portfolio_value"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#snap-pvGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : chartMode === "twr" ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="snap-twrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                <stop offset={twrOffset} stopColor="#10b981" stopOpacity={0.05} />
                <stop offset={twrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="snap-twrStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={twrOffset} stopColor="#10b981" />
                <stop offset={twrOffset} stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              tickFormatter={formatPercentAxis}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="time_weighted_return"
              stroke="url(#snap-twrStroke)"
              strokeWidth={2}
              fill="url(#snap-twrGrad)"
              dot={false}
              isAnimationActive={false}
            />
            {benchmarks.map((benchmark) => (
              <Line
                key={benchmark.ticker}
                type="monotone"
                dataKey={`bench_${benchmark.ticker}`}
                stroke={benchmark.color}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : chartMode === "mwr" ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="snap-mwrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="#d946ef" stopOpacity={0.3} />
                <stop offset={mwrOffset} stopColor="#d946ef" stopOpacity={0.05} />
                <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="snap-mwrStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={mwrOffset} stopColor="#d946ef" />
                <stop offset={mwrOffset} stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              tickFormatter={formatPercentAxis}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="money_weighted_return"
              stroke="url(#snap-mwrStroke)"
              strokeWidth={2}
              fill="url(#snap-mwrGrad)"
              dot={false}
              isAnimationActive={false}
            />
            {benchmarks.map((benchmark) => (
              <Line
                key={benchmark.ticker}
                type="monotone"
                dataKey={`bench_${benchmark.ticker}`}
                stroke={benchmark.color}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="snap-ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              tickFormatter={formatPercentAxis}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="current_drawdown"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#snap-ddGrad)"
              baseValue={0}
              dot={false}
              isAnimationActive={false}
            />
            {benchmarks.map((benchmark) => (
              <Line
                key={benchmark.ticker}
                type="monotone"
                dataKey={`bench_${benchmark.ticker}_dd`}
                stroke={benchmark.color}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
