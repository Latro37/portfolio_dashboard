"use client";

import { useId, useMemo, useState } from "react";
import { BenchmarkEntry, PerformancePoint } from "@/lib/api";
import { BenchmarkSelectorRow } from "@/features/charting/BenchmarkSelectorRow";
import { useBenchmarkCatalog } from "@/features/charting/hooks/useBenchmarkCatalog";
import { adaptPortfolioChart } from "@/features/charting/portfolioChartAdapter";
import {
  createMwrTooltipRenderer,
  createOverlayTooltipRenderer,
  createPortfolioTooltipRenderer,
} from "@/features/charting/performanceChartTooltips";
import { calcGradientOffset } from "@/features/charting/transforms";
import type { ChartMode, ChartSeriesPoint } from "@/features/charting/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export type { ChartMode };

interface Props {
  data: PerformancePoint[];
  startDate: string;
  endDate: string;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  period: string;
  onPeriodChange: (p: string) => void;
  hideMWR?: boolean;
  hidePeriodControls?: boolean;
  portfolioLabel?: string;
  chartMode?: ChartMode;
  onChartModeChange?: (m: ChartMode) => void;
  overlayKey?: string;
  overlayLabel?: string;
  overlayColor?: string;
  showOverlay?: boolean;
  onOverlayToggle?: (v: boolean) => void;
  drawdownOverlayKey?: string;
  benchmarks?: BenchmarkEntry[];
  onBenchmarkAdd?: (ticker: string) => void;
  onBenchmarkRemove?: (ticker: string) => void;
}

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;

export function PerformanceChart({
  data,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  period,
  onPeriodChange,
  hideMWR,
  hidePeriodControls,
  portfolioLabel,
  chartMode: controlledMode,
  onChartModeChange,
  overlayKey,
  overlayLabel,
  overlayColor = "#6366f1",
  showOverlay = false,
  onOverlayToggle,
  drawdownOverlayKey,
  benchmarks = [],
  onBenchmarkAdd,
  onBenchmarkRemove,
}: Props) {
  const _uid = useId().replace(/:/g, "");
  const [internalMode, setInternalMode] = useState<ChartMode>("portfolio");
  const mode = controlledMode ?? internalMode;
  const setMode = onChartModeChange ?? setInternalMode;
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showDeposits, setShowDeposits] = useState(true);

  const MAX_BENCHMARKS = 3;
  const {
    customTickerInput,
    showCustomInput,
    catalogDropdownOpen,
    catalogMatches,
    dropdownRef,
    openCustomInput,
    handleInputChange,
    handleInputFocus,
    handleInputBlur,
    submitCustomBenchmark,
    selectCatalogItem,
    refreshCatalog,
  } = useBenchmarkCatalog({
    onBenchmarkAdd,
    benchmarksCount: benchmarks.length,
    maxBenchmarks: MAX_BENCHMARKS,
  });

  const tradingData = useMemo<ChartSeriesPoint[]>(() => {
    const dataset = adaptPortfolioChart(data, benchmarks);
    return dataset.points;
  }, [data, benchmarks]);

  const hasBenchmark = benchmarks.length > 0;
  const singleBenchmark = benchmarks.length === 1;

  const hasData = tradingData.length > 0;

  const twrOffset = calcGradientOffset(tradingData, "time_weighted_return");
  const mwrOffset = calcGradientOffset(tradingData, "money_weighted_return");

  // Detect if data spans multiple calendar years
  const multiYear = hasData &&
    new Date(tradingData[0].date + "T00:00:00").getFullYear() !==
    new Date(tradingData[tradingData.length - 1].date + "T00:00:00").getFullYear();

  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    if (multiYear) {
      const yr = String(dt.getFullYear()).slice(-2);
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " '" + yr;
    }
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatValue = (v: number) =>
    "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const formatPct = (v: number) => v.toFixed(2) + "%";
  const tooltipFormatters = { formatDate, formatValue, formatPct };
  const renderPortfolioTooltip = createPortfolioTooltipRenderer({
    tradingData,
    formatters: tooltipFormatters,
  });
  const renderMwrTooltip = createMwrTooltipRenderer({
    tradingData,
    benchmarks,
    singleBenchmark,
    hasBenchmark,
    formatters: tooltipFormatters,
  });
  const renderTwrTooltip = createOverlayTooltipRenderer({
    tradingData,
    benchmarks,
    singleBenchmark,
    showOverlay,
    overlayColor,
    primaryKey: "time_weighted_return",
    primaryLabel: "TWR",
    overlayKey,
    overlayLabel: overlayLabel || "Backtest",
    benchmarkSuffix: "return",
    formatters: tooltipFormatters,
  });
  const renderDrawdownTooltip = createOverlayTooltipRenderer({
    tradingData,
    benchmarks,
    singleBenchmark,
    showOverlay,
    overlayColor,
    primaryKey: "current_drawdown",
    primaryLabel: "Drawdown",
    overlayKey: drawdownOverlayKey,
    overlayLabel: overlayLabel || "Backtest",
    benchmarkSuffix: "drawdown",
    formatters: tooltipFormatters,
  });
  const isCustomRange = startDate !== "" || endDate !== "";
  const displayStart = startDate || (hasData ? tradingData[0].date : "");
  const displayEnd = endDate || (hasData ? tradingData[tradingData.length - 1].date : "");

  return (
    <Card data-testid="chart-performance" className="border-border/50">
      <CardContent className="pt-6">
        {/* Controls row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Chart mode toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => setMode("portfolio")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "portfolio"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {portfolioLabel || "Portfolio Value"}
            </button>
            <button
              onClick={() => setMode("twr")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "twr"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              TWR
            </button>
            {!hideMWR && (
              <button
                onClick={() => setMode("mwr")}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "mwr"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                MWR
              </button>
            )}
            <button
              onClick={() => setMode("drawdown")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "drawdown"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Drawdown
            </button>
          </div>

          {!hidePeriodControls && (
            <>
              <div className="h-5 w-px bg-border/50" />

              {/* Period pills */}
              <div className="flex rounded-lg bg-muted p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    data-testid={`period-${p}`}
                    onClick={() => {
                      onPeriodChange(p);
                      onStartDateChange("");
                      onEndDateChange("");
                    }}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === p && !isCustomRange
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="h-5 w-px bg-border/50" />

              {/* Date pickers */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={displayStart}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="date"
                  value={displayEnd}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
                />
                {isCustomRange && (
                  <button
                    onClick={() => {
                      onStartDateChange("");
                      onEndDateChange("");
                    }}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        {!hasData ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No data for the selected date range
          </div>
        ) : mode === "portfolio" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id={`pvGrad${_uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`depGrad${_uid}`} x1="0" y1="0" x2="0" y2="1">
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
                  fill={`url(#depGrad${_uid})`}
                  dot={false}
                />
              )}
              {showPortfolio && (
                <Area
                  type="monotone"
                  dataKey="portfolio_value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill={`url(#pvGrad${_uid})`}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : mode === "twr" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id={`twrGradSplit${_uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset={twrOffset} stopColor="#10b981" stopOpacity={0.05} />
                  <stop offset={twrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id={`twrStrokeSplit${_uid}`} x1="0" y1="0" x2="0" y2="1">
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
                stroke={`url(#twrStrokeSplit${_uid})`}
                strokeWidth={2}
                fill={`url(#twrGradSplit${_uid})`}
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
              {benchmarks.map((bench, i) => (
                <Line key={`bench-twr-${i}`} type="monotone" dataKey={`bench_${i}_return`} stroke={bench.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : mode === "mwr" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id={`mwrGradSplit${_uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#d946ef" stopOpacity={0.3} />
                  <stop offset={mwrOffset} stopColor="#d946ef" stopOpacity={0.05} />
                  <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id={`mwrStrokeSplit${_uid}`} x1="0" y1="0" x2="0" y2="1">
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
                stroke={`url(#mwrStrokeSplit${_uid})`}
                strokeWidth={2}
                fill={`url(#mwrGradSplit${_uid})`}
                dot={false}
              />
              {benchmarks.map((bench, i) => (
                <Line key={`bench-mwr-${i}`} type="monotone" dataKey={`bench_${i}_mwr`} stroke={bench.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id={`ddGrad${_uid}`} x1="0" y1="0" x2="0" y2="1">
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
                fill={`url(#ddGrad${_uid})`}
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
              {benchmarks.map((bench, i) => (
                <Line key={`bench-dd-${i}`} type="monotone" dataKey={`bench_${i}_drawdown`} stroke={bench.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Portfolio/Deposits legend below chart */}
        {(mode === "twr" || mode === "drawdown") && hasData && onOverlayToggle && (overlayKey || drawdownOverlayKey) && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium cursor-default ${
                mode === "drawdown" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: mode === "drawdown" ? "#ef4444" : "#10b981" }} />
              Live
            </button>
            <button
              onClick={() => onOverlayToggle(!showOverlay)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showOverlay ? "text-indigo-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showOverlay ? overlayColor : "#71717a" }} />
              {overlayLabel || "Overlay"}
            </button>
          </div>
        )}
        {mode === "portfolio" && hasData && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              onClick={() => { if (showDeposits) setShowPortfolio(!showPortfolio); }}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showPortfolio ? "text-emerald-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showPortfolio ? "#10b981" : "#71717a" }} />
              Portfolio
            </button>
            <button
              onClick={() => { if (showPortfolio) setShowDeposits(!showDeposits); }}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showDeposits ? "text-indigo-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showDeposits ? "#6366f1" : "#71717a" }} />
              Deposits
            </button>
          </div>
        )}

        {/* Benchmark toggle row — hidden in Portfolio mode */}
        {mode !== "portfolio" && hasData && onBenchmarkAdd && (
          <BenchmarkSelectorRow
            benchmarks={benchmarks}
            maxBenchmarks={MAX_BENCHMARKS}
            showCustomInput={showCustomInput}
            customTickerInput={customTickerInput}
            catalogDropdownOpen={catalogDropdownOpen}
            catalogMatches={catalogMatches}
            dropdownRef={dropdownRef}
            onPresetToggle={(ticker) => {
              const isActive = benchmarks.some((benchmark) => benchmark.ticker === ticker);
              if (isActive) {
                onBenchmarkRemove?.(ticker);
                return;
              }
              if (benchmarks.length < MAX_BENCHMARKS) {
                onBenchmarkAdd(ticker);
              }
            }}
            onOpenCustomInput={openCustomInput}
            onInputChange={handleInputChange}
            onInputFocus={handleInputFocus}
            onInputBlur={handleInputBlur}
            onSubmitCustom={submitCustomBenchmark}
            onRefreshCatalog={refreshCatalog}
            onSelectCatalogItem={selectCatalogItem}
            onRemoveBenchmark={(ticker) => onBenchmarkRemove?.(ticker)}
          />
        )}
      </CardContent>
    </Card>
  );
}


