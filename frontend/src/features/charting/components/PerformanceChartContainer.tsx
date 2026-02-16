"use client";

import { useId, useMemo, useState } from "react";
import { BenchmarkEntry, PerformancePoint } from "@/lib/api";
import { BenchmarkSelectorRow } from "@/features/charting/BenchmarkSelectorRow";
import { PerformanceChartCanvas } from "@/features/charting/PerformanceChartCanvas";
import { PerformanceChartControlsRow } from "@/features/charting/PerformanceChartControlsRow";
import { PerformanceChartLegendRows } from "@/features/charting/PerformanceChartLegendRows";
import { useBenchmarkCatalog } from "@/features/charting/hooks/useBenchmarkCatalog";
import { useObservedSpyTradingDays } from "@/features/charting/hooks/useObservedSpyTradingDays";
import {
  MAX_BENCHMARKS,
} from "@/features/charting/benchmarkConfig";
import { adaptPortfolioChart } from "@/features/charting/portfolioChartAdapter";
import {
  createMwrTooltipRenderer,
  createOverlayTooltipRenderer,
  createPortfolioTooltipRenderer,
} from "@/features/charting/performanceChartTooltips";
import { calcGradientOffset } from "@/features/charting/transforms";
import type { ChartMode, ChartSeriesPoint } from "@/features/charting/types";
import { Card, CardContent } from "@/components/ui/card";

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

  const sourceDates = useMemo(() => data.map((point) => point.date), [data]);
  const tradingDayEvidence = useObservedSpyTradingDays(sourceDates);

  const tradingData = useMemo<ChartSeriesPoint[]>(() => {
    const dataset = adaptPortfolioChart(data, benchmarks, tradingDayEvidence);
    return dataset.points;
  }, [data, benchmarks, tradingDayEvidence]);

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
        <PerformanceChartControlsRow
          mode={mode}
          setMode={setMode}
          portfolioLabel={portfolioLabel}
          hideMWR={hideMWR}
          hidePeriodControls={hidePeriodControls}
          period={period}
          isCustomRange={isCustomRange}
          displayStart={displayStart}
          displayEnd={displayEnd}
          onPeriodChange={onPeriodChange}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
        />

        <PerformanceChartCanvas
          uid={_uid}
          mode={mode}
          tradingData={tradingData}
          hasData={hasData}
          formatDate={formatDate}
          formatValue={formatValue}
          formatPct={formatPct}
          twrOffset={twrOffset}
          mwrOffset={mwrOffset}
          showPortfolio={showPortfolio}
          showDeposits={showDeposits}
          overlayKey={overlayKey}
          showOverlay={showOverlay}
          overlayColor={overlayColor}
          drawdownOverlayKey={drawdownOverlayKey}
          benchmarks={benchmarks}
          renderPortfolioTooltip={renderPortfolioTooltip}
          renderTwrTooltip={renderTwrTooltip}
          renderMwrTooltip={renderMwrTooltip}
          renderDrawdownTooltip={renderDrawdownTooltip}
        />

        <PerformanceChartLegendRows
          mode={mode}
          hasData={hasData}
          showOverlay={showOverlay}
          overlayColor={overlayColor}
          overlayLabel={overlayLabel}
          overlayAvailable={Boolean(overlayKey || drawdownOverlayKey)}
          onOverlayToggle={onOverlayToggle}
          showPortfolio={showPortfolio}
          showDeposits={showDeposits}
          onTogglePortfolio={() => {
            if (showDeposits) {
              setShowPortfolio(!showPortfolio);
            }
          }}
          onToggleDeposits={() => {
            if (showPortfolio) {
              setShowDeposits(!showDeposits);
            }
          }}
        />

        {/* Benchmark toggle row - hidden in Portfolio mode */}
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


