import { useMemo, type ReactNode } from "react";
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
import {
  stackLabelPositions,
  valueToPixelY,
} from "@/features/charting/endLabelLayout";
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

type EndLabelSeries = {
  dataKey: string;
  label: string;
  color: string;
  formatter: (value: number) => string;
};

const CHART_HEIGHT = 320;
const CHART_MARGIN = { top: 5, right: 120, bottom: 5, left: 5 };
const CHART_MARGIN_NO_LABELS = { ...CHART_MARGIN, right: 20 };

const END_LABEL_GAP = 16;
const END_LABEL_FONT_SIZE = 11;
const END_LABEL_FONT_WEIGHT = 700;

function shortLabel(label: string): string {
  const maxChars = 10;
  if (label.length <= maxChars) return label;
  return `${label.slice(0, maxChars - 3)}...`;
}

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
  const lastIndexesByKey = useMemo(() => {
    const byKey: Record<string, number> = {};
    if (!tradingData.length) return byKey;

    for (let i = tradingData.length - 1; i >= 0; i -= 1) {
      const point = tradingData[i] as Record<string, unknown>;
      Object.entries(point).forEach(([key, value]) => {
        if (byKey[key] !== undefined) return;
        if (typeof value === "number" && Number.isFinite(value)) {
          byKey[key] = i;
        }
      });
    }
    return byKey;
  }, [tradingData]);

  const activeEndLabels = useMemo<EndLabelSeries[]>(() => {
    if (mode === "portfolio") return [];

    if (mode === "twr") {
      const labels: EndLabelSeries[] = [
        {
          dataKey: "time_weighted_return",
          label: "TWR",
          color: "#10b981",
          formatter: formatPct,
        },
      ];
      if (overlayKey && showOverlay) {
        labels.push({
          dataKey: overlayKey,
          label: "Backtest",
          color: overlayColor,
          formatter: formatPct,
        });
      }
      benchmarks.forEach((benchmark, index) => {
        labels.push({
          dataKey: `bench_${index}_return`,
          label: benchmark.label || benchmark.ticker,
          color: benchmark.color,
          formatter: formatPct,
        });
      });
      return labels;
    }

    if (mode === "mwr") {
      const labels: EndLabelSeries[] = [
        {
          dataKey: "money_weighted_return",
          label: "MWR",
          color: "#d946ef",
          formatter: formatPct,
        },
      ];
      benchmarks.forEach((benchmark, index) => {
        labels.push({
          dataKey: `bench_${index}_mwr`,
          label: benchmark.label || benchmark.ticker,
          color: benchmark.color,
          formatter: formatPct,
        });
      });
      return labels;
    }

    const labels: EndLabelSeries[] = [
      {
        dataKey: "current_drawdown",
        label: "Drawdown",
        color: "#ef4444",
        formatter: formatPct,
      },
    ];
    if (drawdownOverlayKey && showOverlay) {
      labels.push({
        dataKey: drawdownOverlayKey,
        label: "Backtest",
        color: overlayColor,
        formatter: formatPct,
      });
    }
    benchmarks.forEach((benchmark, index) => {
      labels.push({
        dataKey: `bench_${index}_drawdown`,
        label: benchmark.label || benchmark.ticker,
        color: benchmark.color,
        formatter: formatPct,
      });
    });
    return labels;
  }, [
    mode,
    overlayKey,
    showOverlay,
    overlayColor,
    benchmarks,
    formatPct,
    drawdownOverlayKey,
  ]);

  const endLabelOffsetByKey = useMemo(() => {
    const numericValues: number[] = [];
    activeEndLabels.forEach((series) => {
      for (let i = 0; i < tradingData.length; i += 1) {
        const value = (tradingData[i] as Record<string, unknown>)[series.dataKey];
        if (typeof value === "number" && Number.isFinite(value)) {
          numericValues.push(value);
        }
      }
    });

    if (!numericValues.length) return {} as Record<string, number>;

    let domainMin = Math.min(...numericValues);
    let domainMax = Math.max(...numericValues);
    if (mode !== "portfolio") {
      domainMin = Math.min(domainMin, 0);
      domainMax = Math.max(domainMax, 0);
    }

    const labelHalfHeight = END_LABEL_FONT_SIZE / 2;
    const minY = CHART_MARGIN.top + 4 + labelHalfHeight;
    const maxY = CHART_HEIGHT - CHART_MARGIN.bottom - 4 - labelHalfHeight;

    const candidates = activeEndLabels
      .map((series) => {
        const lastIndex = lastIndexesByKey[series.dataKey];
        if (lastIndex === undefined) return null;
        const lastValue = (tradingData[lastIndex] as Record<string, unknown>)[series.dataKey];
        if (typeof lastValue !== "number" || !Number.isFinite(lastValue)) return null;
        return {
          id: series.dataKey,
          rawY: valueToPixelY(lastValue, domainMin, domainMax, minY, maxY),
        };
      })
      .filter((candidate): candidate is { id: string; rawY: number } => candidate !== null);

    const stackedYByKey = stackLabelPositions(candidates, minY, maxY, END_LABEL_GAP);

    const offsets: Record<string, number> = {};
    candidates.forEach((candidate) => {
      const stackedY = stackedYByKey[candidate.id];
      if (typeof stackedY === "number") {
        offsets[candidate.id] = stackedY - candidate.rawY;
      }
    });

    return offsets;
  }, [activeEndLabels, lastIndexesByKey, mode, tradingData]);

  const createEndLabel = (
    dataKey: string,
    label: string,
    color: string,
    formatter: (value: number) => string,
  ) => {
    const lastIndex = lastIndexesByKey[dataKey];
    const yOffset = endLabelOffsetByKey[dataKey];
    if (lastIndex === undefined || yOffset === undefined) return undefined;

    function renderEndLabel(props: {
      index?: number;
      x?: number;
      y?: number;
      value?: number;
    }) {
      if (
        props.index !== lastIndex ||
        typeof props.x !== "number" ||
        typeof props.y !== "number" ||
        typeof props.value !== "number"
      ) {
        return null;
      }

      const labelHalfHeight = END_LABEL_FONT_SIZE / 2;
      const minY = CHART_MARGIN.top + 4 + labelHalfHeight;
      const maxY = CHART_HEIGHT - CHART_MARGIN.bottom - 4 - labelHalfHeight;
      const y = Math.min(maxY, Math.max(minY, props.y + yOffset));
      return (
        <text
          x={props.x + 8}
          y={y}
          fill={color}
          fontSize={END_LABEL_FONT_SIZE}
          fontWeight={END_LABEL_FONT_WEIGHT}
          textAnchor="start"
          dominantBaseline="middle"
        >
          {`${shortLabel(label)} ${formatter(props.value)}`}
        </text>
      );
    }

    return renderEndLabel;
  };

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
        <AreaChart data={tradingData} margin={CHART_MARGIN_NO_LABELS}>
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
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={formatValue} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={renderPortfolioTooltip} />
          {showDeposits && (
            <Area type="monotone" dataKey="net_deposits" stroke="#6366f1" strokeWidth={1.5} fill={`url(#depGrad${uid})`} dot={false} />
          )}
          {showPortfolio && (
            <Area type="monotone" dataKey="portfolio_value" stroke="#10b981" strokeWidth={2} fill={`url(#pvGrad${uid})`} dot={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (mode === "twr") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={tradingData} margin={CHART_MARGIN}>
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
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={formatPct} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={renderTwrTooltip} />
          <Area type="monotone" dataKey="time_weighted_return" stroke={`url(#twrStrokeSplit${uid})`} strokeWidth={2} fill={`url(#twrGradSplit${uid})`} dot={false} label={createEndLabel("time_weighted_return", "TWR", "#10b981", formatPct)} />
          {overlayKey && showOverlay && (
            <Line type="monotone" dataKey={overlayKey} stroke={overlayColor} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls label={createEndLabel(overlayKey, "Backtest", overlayColor, formatPct)} />
          )}
          {benchmarks.map((benchmark, index) => (
            <Line key={`bench-twr-${index}`} type="monotone" dataKey={`bench_${index}_return`} stroke={benchmark.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls label={createEndLabel(`bench_${index}_return`, benchmark.label || benchmark.ticker, benchmark.color, formatPct)} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (mode === "mwr") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={tradingData} margin={CHART_MARGIN}>
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
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis tickFormatter={formatPct} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={renderMwrTooltip} />
          <Area type="monotone" dataKey="money_weighted_return" stroke={`url(#mwrStrokeSplit${uid})`} strokeWidth={2} fill={`url(#mwrGradSplit${uid})`} dot={false} label={createEndLabel("money_weighted_return", "MWR", "#d946ef", formatPct)} />
          {benchmarks.map((benchmark, index) => (
            <Line key={`bench-mwr-${index}`} type="monotone" dataKey={`bench_${index}_mwr`} stroke={benchmark.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls label={createEndLabel(`bench_${index}_mwr`, benchmark.label || benchmark.ticker, benchmark.color, formatPct)} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={tradingData} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id={`ddGrad${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis tickFormatter={formatPct} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
        <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
        <Tooltip content={renderDrawdownTooltip} />
        <Area type="monotone" dataKey="current_drawdown" stroke="#ef4444" strokeWidth={2} fill={`url(#ddGrad${uid})`} baseValue={0} dot={false} label={createEndLabel("current_drawdown", "Drawdown", "#ef4444", formatPct)} />
        {drawdownOverlayKey && showOverlay && (
          <Line type="monotone" dataKey={drawdownOverlayKey} stroke={overlayColor} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls label={createEndLabel(drawdownOverlayKey, "Backtest", overlayColor, formatPct)} />
        )}
        {benchmarks.map((benchmark, index) => (
          <Line key={`bench-dd-${index}`} type="monotone" dataKey={`bench_${index}_drawdown`} stroke={benchmark.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls label={createEndLabel(`bench_${index}_drawdown`, benchmark.label || benchmark.ticker, benchmark.color, formatPct)} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
