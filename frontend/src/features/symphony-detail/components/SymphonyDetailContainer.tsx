"use client";

import { useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { SymphonyInfo } from "@/lib/api";
import { PerformanceChart } from "@/components/PerformanceChart";
import type { ChartMode } from "@/features/charting/types";
import { SymphonyBacktestControls } from "@/features/symphony-detail/components/SymphonyBacktestControls";
import { SymphonyBacktestBenchmarkRow } from "@/features/symphony-detail/components/SymphonyBacktestBenchmarkRow";
import { SymphonyBacktestChartPanel } from "@/features/symphony-detail/components/SymphonyBacktestChartPanel";
import { BacktestMetricsSummary } from "@/features/symphony-detail/components/BacktestMetricsSummary";
import { HistoricalAllocationsTable } from "@/features/symphony-detail/components/HistoricalAllocationsTable";
import { SymphonyBacktestHoldingsSection } from "@/features/symphony-detail/components/SymphonyBacktestHoldingsSection";
import { SymphonyDetailTabs } from "@/features/symphony-detail/components/SymphonyDetailTabs";
import { SymphonyHeaderSection } from "@/features/symphony-detail/components/SymphonyHeaderSection";
import { SymphonyLiveHoldingsSection } from "@/features/symphony-detail/components/SymphonyLiveHoldingsSection";
import { SymphonyLiveMetricsSection } from "@/features/symphony-detail/components/SymphonyLiveMetricsSection";
import { SymphonyTradePreviewSection } from "@/features/symphony-detail/components/SymphonyTradePreviewSection";
import { useSymphonyBenchmarkManager } from "@/features/symphony-detail/hooks/useSymphonyBenchmarkManager";
import { useSymphonyChartModels } from "@/features/symphony-detail/hooks/useSymphonyChartModels";
import { useSymphonyDetailData } from "@/features/symphony-detail/hooks/useSymphonyDetailData";
import { useSymphonyDetailViewEffects } from "@/features/symphony-detail/hooks/useSymphonyDetailViewEffects";
import {
  SymphonyDetailPeriod,
  SymphonyDetailTab,
} from "@/features/symphony-detail/types";

interface Props {
  symphony: SymphonyInfo;
  onClose: () => void;
  scrollToSection?: "trade-preview";
}

type Period = SymphonyDetailPeriod;
type Tab = SymphonyDetailTab;

export function SymphonyDetail({ symphony, onClose, scrollToSection }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [chartMode, setChartMode] = useState<ChartMode>("portfolio");
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const tradePreviewRef = useRef<HTMLDivElement>(null);
  const [showBacktestOverlay, setShowBacktestOverlay] = useState(false);
  const [showLiveOverlay, setShowLiveOverlay] = useState(false);
  const {
    liveData,
    backtest,
    liveSummary,
    liveAllocations,
    tradePreview,
    tradePreviewRefreshedAt,
    loadingLive,
    loadingBacktest,
    loadingTradePreview,
    fetchBacktest,
    fetchTradePreview,
  } = useSymphonyDetailData({
    symphony,
    period,
    customStart,
    customEnd,
  });
  const {
    benchmarks,
    customInputVisible,
    customTickerInput,
    catalogDropdownOpen,
    catalogMatches,
    benchmarkDropdownRef,
    maxBenchmarks,
    setCustomInputVisible,
    setCustomTickerInput,
    setCatalogDropdownOpen,
    refreshSymphonyCatalog,
    addBenchmark,
    removeBenchmark,
  } = useSymphonyBenchmarkManager(symphony.account_id);
  const oosDate = useMemo(() => {
    const timestamp = backtest?.last_semantic_update_at;
    return timestamp ? timestamp.slice(0, 10) : "";
  }, [backtest]);
  const s = symphony;

  useSymphonyDetailViewEffects({
    scrollToSection,
    tradePreview,
    tradePreviewRef,
  });
  const btCustomInput = customInputVisible;
  const btCustomTickerInput = customTickerInput;
  const btCatalogMatches = catalogMatches;
  const btDropdownRef = benchmarkDropdownRef;
  const MAX_BENCHMARKS = maxBenchmarks;
  const handleBenchmarkAdd = addBenchmark;
  const handleBenchmarkRemove = removeBenchmark;
  const setBtCustomInput = setCustomInputVisible;
  const setBtCustomTickerInput = setCustomTickerInput;

  const {
    filteredBacktestData,
    mergedLiveData,
    mergedBacktestData,
    backtestTwrOffset,
    btFormatDate,
    liveMetrics,
    btMetrics,
  } = useSymphonyChartModels({
    liveData,
    backtest,
    liveSummary,
    benchmarks,
    period,
    customStart,
    customEnd,
    oosDate,
  });

  return (
    <div
      data-testid="modal-symphony-detail"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 my-8 w-full max-w-7xl rounded-2xl border border-border bg-background shadow-2xl">
        {/* Close button */}
        <button
          data-testid="btn-close-symphony-detail"
          onClick={onClose}
          className="cursor-pointer absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 space-y-6">
          <SymphonyHeaderSection symphony={s} />

          <SymphonyLiveMetricsSection symphony={s} liveMetrics={liveMetrics} />

          <SymphonyDetailTabs
            tab={tab}
            onTabChange={setTab}
            loadingBacktest={loadingBacktest}
            onRefreshBacktest={() => {
              fetchBacktest(true).catch(() => undefined);
            }}
          />

          {/* Chart area */}
          {tab === "live" ? (
            loadingLive ? (
              <div className="flex h-[320px] items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PerformanceChart
                data={mergedLiveData}
                period={period}
                onPeriodChange={(p) => setPeriod(p as Period)}
                startDate={customStart}
                endDate={customEnd}
                onStartDateChange={setCustomStart}
                onEndDateChange={setCustomEnd}
                portfolioLabel="Symphony Value"
                chartMode={chartMode}
                onChartModeChange={setChartMode}
                overlayKey="backtestTwr"
                overlayLabel="Backtest"
                overlayColor="#6366f1"
                showOverlay={showBacktestOverlay}
                onOverlayToggle={setShowBacktestOverlay}
                drawdownOverlayKey="backtestDrawdown"
                benchmarks={benchmarks}
                onBenchmarkAdd={handleBenchmarkAdd}
                onBenchmarkRemove={handleBenchmarkRemove}
              />
            )
          ) : (
            <div>
              <SymphonyBacktestControls
                chartMode={chartMode}
                period={period}
                customStart={customStart}
                customEnd={customEnd}
                filteredBacktestData={filteredBacktestData}
                oosDate={oosDate}
                onChartModeChange={setChartMode}
                onPeriodChange={setPeriod}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
                onClearCustomRange={() => {
                  setCustomStart("");
                  setCustomEnd("");
                }}
              />

              <SymphonyBacktestChartPanel
                chartMode={chartMode}
                loadingBacktest={loadingBacktest}
                filteredBacktestData={filteredBacktestData}
                mergedBacktestData={mergedBacktestData}
                btFormatDate={btFormatDate}
                backtestTwrOffset={backtestTwrOffset}
                showLiveOverlay={showLiveOverlay}
                onToggleLiveOverlay={() => setShowLiveOverlay(!showLiveOverlay)}
                benchmarks={benchmarks}
              />

              <SymphonyBacktestBenchmarkRow
                hasData={filteredBacktestData.length > 0}
                benchmarks={benchmarks}
                maxBenchmarks={MAX_BENCHMARKS}
                customInputVisible={btCustomInput}
                customTickerInput={btCustomTickerInput}
                catalogDropdownOpen={catalogDropdownOpen}
                catalogMatches={btCatalogMatches}
                benchmarkDropdownRef={btDropdownRef}
                onAddBenchmark={handleBenchmarkAdd}
                onRemoveBenchmark={handleBenchmarkRemove}
                onCustomInputVisibleChange={setBtCustomInput}
                onCustomTickerInputChange={setBtCustomTickerInput}
                onCatalogDropdownOpenChange={setCatalogDropdownOpen}
                onRefreshCatalog={() => {
                  refreshSymphonyCatalog().catch(() => undefined);
                }}
              />

              <BacktestMetricsSummary btMetrics={btMetrics} show={filteredBacktestData.length >= 2} />
            </div>
          )}

          {tab === "live" && <SymphonyLiveHoldingsSection holdings={s.holdings} />}

          {tab === "backtest" && (
            <SymphonyBacktestHoldingsSection tdvmWeights={backtest?.tdvm_weights} />
          )}

          {tab === "live" && (
            <div ref={tradePreviewRef}>
              <SymphonyTradePreviewSection
                tradePreview={tradePreview}
                tradePreviewRefreshedAt={tradePreviewRefreshedAt}
                loadingTradePreview={loadingTradePreview}
                onRefresh={() => {
                  fetchTradePreview().catch(() => undefined);
                }}
              />
            </div>
          )}

          {/* Historical Allocations — live (from daily sync snapshots) */}
          {tab === "live" && Object.keys(liveAllocations).length > 0 && (
            <HistoricalAllocationsTable tdvmWeights={liveAllocations} label="Historical Allocations (Live)" isLive />
          )}

          {/* Historical Allocations — backtest (from backtest tdvm_weights) */}
          {tab === "backtest" && backtest && Object.keys(backtest.tdvm_weights).length > 0 && (
            <HistoricalAllocationsTable tdvmWeights={backtest.tdvm_weights} label="Historical Allocations (Backtest)" />
          )}
        </div>
      </div>
    </div>
  );
}




