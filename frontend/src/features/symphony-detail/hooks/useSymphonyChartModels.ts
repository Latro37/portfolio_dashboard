import { useMemo } from "react";

import type {
  BenchmarkEntry,
  PerformancePoint,
  SymphonyBacktest,
  SymphonySummary,
} from "@/lib/api";
import type { SymphonyDetailPeriod } from "@/features/symphony-detail/types";
import { makeDateFormatter } from "@/features/symphony-detail/utils";
import { useObservedSpyTradingDays } from "@/features/charting/hooks/useObservedSpyTradingDays";
import {
  buildBacktestChartData,
  buildBacktestMetrics,
  buildLiveMetrics,
  calcTwrOffset,
  filterBacktestData,
  filterLiveData,
  mergeBacktestData,
  mergeLiveData,
} from "@/features/symphony-detail/hooks/symphonyChartModelTransforms";
import type {
  BacktestChartPoint,
  LiveChartPoint,
  SymphonyBacktestMetricsView,
  SymphonyLiveMetricsView,
} from "@/features/symphony-detail/hooks/symphonyChartModelTypes";

export type {
  BacktestChartPoint,
  LiveChartPoint,
  SymphonyBacktestMetricsView,
  SymphonyLiveMetricsView,
} from "@/features/symphony-detail/hooks/symphonyChartModelTypes";

type Args = {
  liveData: PerformancePoint[];
  backtest: SymphonyBacktest | null;
  liveSummary: SymphonySummary | null;
  benchmarks: BenchmarkEntry[];
  period: SymphonyDetailPeriod;
  customStart: string;
  customEnd: string;
  oosDate: string;
};

export function useSymphonyChartModels({
  liveData,
  backtest,
  liveSummary,
  benchmarks,
  period,
  customStart,
  customEnd,
  oosDate,
}: Args) {
  const backtestChartData = useMemo(
    () => buildBacktestChartData(backtest),
    [backtest],
  );

  const sourceDates = useMemo(
    () => [...liveData.map((point) => point.date), ...backtestChartData.map((point) => point.date)],
    [liveData, backtestChartData],
  );
  const tradingDayEvidence = useObservedSpyTradingDays(sourceDates);

  const filteredLiveData = useMemo(
    () => filterLiveData(liveData, period, customStart, customEnd, oosDate, tradingDayEvidence),
    [liveData, period, customStart, customEnd, oosDate, tradingDayEvidence],
  );

  const filteredBacktestData = useMemo(
    () =>
      filterBacktestData(
        backtestChartData,
        period,
        customStart,
        customEnd,
        oosDate,
        tradingDayEvidence,
      ),
    [backtestChartData, period, customStart, customEnd, oosDate, tradingDayEvidence],
  );

  const backtestTwrOffset = calcTwrOffset(filteredBacktestData);
  const btFormatDate = makeDateFormatter(filteredBacktestData);

  const mergedLiveData = useMemo<LiveChartPoint[]>(
    () => mergeLiveData(filteredLiveData, filteredBacktestData),
    [filteredLiveData, filteredBacktestData],
  );

  const mergedBacktestData = useMemo<BacktestChartPoint[]>(
    () => mergeBacktestData(filteredBacktestData, filteredLiveData, benchmarks),
    [filteredBacktestData, filteredLiveData, benchmarks],
  );

  const liveMetrics = useMemo<SymphonyLiveMetricsView>(
    () => buildLiveMetrics(liveSummary, filteredLiveData),
    [liveSummary, filteredLiveData],
  );

  const btMetrics = useMemo<SymphonyBacktestMetricsView>(
    () => buildBacktestMetrics(filteredBacktestData, backtest, period, customStart, customEnd),
    [filteredBacktestData, backtest, period, customStart, customEnd],
  );

  return {
    filteredLiveData,
    filteredBacktestData,
    mergedLiveData,
    mergedBacktestData,
    backtestTwrOffset,
    btFormatDate,
    liveMetrics,
    btMetrics,
  };
}
