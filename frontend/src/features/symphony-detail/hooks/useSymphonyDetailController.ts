"use client";

import { useMemo, useState } from "react";

import type { SymphonyInfo } from "@/lib/api";
import type { ChartMode } from "@/features/charting/types";
import { SymphonyDetailPeriod, SymphonyDetailTab } from "@/features/symphony-detail/types";
import { useSymphonyBenchmarkManager } from "@/features/symphony-detail/hooks/useSymphonyBenchmarkManager";
import { useSymphonyChartModels } from "@/features/symphony-detail/hooks/useSymphonyChartModels";
import { useSymphonyDetailData } from "@/features/symphony-detail/hooks/useSymphonyDetailData";

export function useSymphonyDetailController(symphony: SymphonyInfo) {
  const [tab, setTab] = useState<SymphonyDetailTab>("live");
  const [chartMode, setChartMode] = useState<ChartMode>("portfolio");
  const [period, setPeriod] = useState<SymphonyDetailPeriod>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showBacktestOverlay, setShowBacktestOverlay] = useState(false);
  const [showLiveOverlay, setShowLiveOverlay] = useState(false);

  const data = useSymphonyDetailData({
    symphony,
    period,
    customStart,
    customEnd,
  });

  const benchmarks = useSymphonyBenchmarkManager(symphony.account_id);
  const { refreshSymphonyCatalog: _refreshCatalogRaw, ...benchmarkState } = benchmarks;
  const oosDate = useMemo(() => {
    const timestamp = data.backtest?.last_semantic_update_at;
    return timestamp ? timestamp.slice(0, 10) : "";
  }, [data.backtest]);

  const chartModels = useSymphonyChartModels({
    liveData: data.liveData,
    backtest: data.backtest,
    liveSummary: data.liveSummary,
    benchmarks: benchmarks.benchmarks,
    period,
    customStart,
    customEnd,
    oosDate,
  });

  const clearCustomRange = () => {
    setCustomStart("");
    setCustomEnd("");
  };
  const refreshBacktest = () => {
    data.fetchBacktest(true).catch(() => undefined);
  };
  const refreshTradePreview = () => {
    data.fetchTradePreview().catch(() => undefined);
  };
  const refreshSymphonyCatalogSafe = () => {
    _refreshCatalogRaw().catch(() => undefined);
  };
  const toggleLiveOverlay = () => {
    setShowLiveOverlay((prev) => !prev);
  };

  return {
    tab,
    setTab,
    chartMode,
    setChartMode,
    period,
    setPeriod,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    showBacktestOverlay,
    setShowBacktestOverlay,
    showLiveOverlay,
    toggleLiveOverlay,
    oosDate,
    clearCustomRange,
    refreshBacktest,
    refreshTradePreview,
    ...data,
    ...benchmarkState,
    refreshSymphonyCatalog: refreshSymphonyCatalogSafe,
    ...chartModels,
  };
}
