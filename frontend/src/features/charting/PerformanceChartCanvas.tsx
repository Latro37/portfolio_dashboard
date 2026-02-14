import type { ReactNode } from "react";
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

import type { BenchmarkEntry } from "@/lib/api";
import type { ChartMode, ChartSeriesPoint } from "@/features/charting/types";

type TooltipPayloadEntry = {
  dataKey?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
};

type TooltipRenderer = (props: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: string | number;
}) => ReactNode;

type Props = {
  uid: string;
  mode: ChartMode;
  tradingData: ChartSeriesPoint[];
  hasData: boolean;
  formatDate: (value: string) => string;
  formatValue: (value: number) => string;
  formatPct: (value: number) => string;
  twrOffset: number;
  mwrOffset: number;
  showPortfolio: boolean;
  showDeposits: boolean;
  overlayKey?: string;
  showOverlay: boolean;
  overlayColor: string;
  drawdownOverlayKey?: string;
  benchmarks: BenchmarkEntry[];
  renderPortfolioTooltip: TooltipRenderer;
  renderTwrTooltip: TooltipRenderer;
  renderMwrTooltip: TooltipRenderer;
  renderDrawdownTooltip: TooltipRenderer;
};

export function PerformanceChartCanvas({
  uid,
  mode,
  tradingData,
  hasData,
  formatDate,
  formatValue,
  formatPct,
  twrOffset,
  mwrOffset,
  showPortfolio,
  showDeposits,
  overlayKey,
  showOverlay,
  overlayColor,
  drawdownOverlayKey,
  benchmarks,
  renderPortfolioTooltip,
  renderTwrTooltip,
  renderMwrTooltip,
  renderDrawdownTooltip,
}: Props) {
  if (!hasData) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        No data for the selected date range
      </div>
    );
  }

  if (mode === "portfolio") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id={`pvGrad${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`depGrad${uid}`} x1="0" y1="0" x2="0" y2="1">
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
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatValue}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={renderPortfolioTooltip} />
          {showDeposits && (
            <Area
              type="monotone"
              dataKey="net_deposits"
              stroke="#6366f1"
              strokeWidth={1.5}
              fill={`url(#depGrad${uid})`}
              dot={false}
            />
          )}
          {showPortfolio && (
            <Area
              type="monotone"
              dataKey="portfolio_value"
              stroke="#10b981"
              strokeWidth={2}
              fill={`url(#pvGrad${uid})`}
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (mode === "twr") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id={`twrGradSplit${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
              <stop offset={twrOffset} stopColor="#10b981" stopOpacity={0.05} />
              <stop offset={twrOffset} stopColor="#ef4444" stopOpacity={0.15} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id={`twrStrokeSplit${uid}`} x1="0" y1="0" x2="0" y2="1">
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
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatPct}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={renderTwrTooltip} />
          <Area
            type="monotone"
            dataKey="time_weighted_return"
            stroke={`url(#twrStrokeSplit${uid})`}
            strokeWidth={2}
            fill={`url(#twrGradSplit${uid})`}
            dot={false}
          />
          {overlayKey && showOverlay && (
            <Line
              type="monotone"
              dataKey={overlayKey}
              stroke={overlayColor}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          )}
          {benchmarks.map((benchmark, index) => (
            <Line
              key={`bench-twr-${index}`}
              type="monotone"
              dataKey={`bench_${index}_return`}
              stroke={benchmark.color}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (mode === "mwr") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id={`mwrGradSplit${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#d946ef" stopOpacity={0.3} />
              <stop offset={mwrOffset} stopColor="#d946ef" stopOpacity={0.05} />
              <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
              <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id={`mwrStrokeSplit${uid}`} x1="0" y1="0" x2="0" y2="1">
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
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatPct}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={renderMwrTooltip} />
          <Area
            type="monotone"
            dataKey="money_weighted_return"
            stroke={`url(#mwrStrokeSplit${uid})`}
            strokeWidth={2}
            fill={`url(#mwrGradSplit${uid})`}
            dot={false}
          />
          {benchmarks.map((benchmark, index) => (
            <Line
              key={`bench-mwr-${index}`}
              type="monotone"
              dataKey={`bench_${index}_mwr`}
              stroke={benchmark.color}
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id={`ddGrad${uid}`} x1="0" y1="0" x2="0" y2="1">
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
          minTickGap={40}
        />
        <YAxis
          tickFormatter={formatPct}
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Tooltip content={renderDrawdownTooltip} />
        <Area
          type="monotone"
          dataKey="current_drawdown"
          stroke="#ef4444"
          strokeWidth={2}
          fill={`url(#ddGrad${uid})`}
          baseValue={0}
          dot={false}
        />
        {drawdownOverlayKey && showOverlay && (
          <Line
            type="monotone"
            dataKey={drawdownOverlayKey}
            stroke={overlayColor}
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls
          />
        )}
        {benchmarks.map((benchmark, index) => (
          <Line
            key={`bench-dd-${index}`}
            type="monotone"
            dataKey={`bench_${index}_drawdown`}
            stroke={benchmark.color}
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
