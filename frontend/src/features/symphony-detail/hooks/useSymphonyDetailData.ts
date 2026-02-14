import { useCallback, useEffect, useState } from "react";

import {
  api,
  PerformancePoint,
  SymphonyBacktest,
  SymphonyInfo,
  SymphonySummary,
  SymphonyTradePreview,
} from "@/lib/api";
import { isMarketOpen, isWithinTradingSession } from "@/lib/marketHours";
import { SymphonyDetailPeriod } from "@/features/symphony-detail/types";
import { useSymphonyBacktestState } from "@/features/symphony-detail/hooks/useSymphonyBacktestState";
import { useSymphonyLivePerformanceState } from "@/features/symphony-detail/hooks/useSymphonyLivePerformanceState";
import { useSymphonyTradePreviewState } from "@/features/symphony-detail/hooks/useSymphonyTradePreviewState";

type Args = {
  symphony: SymphonyInfo;
  period: SymphonyDetailPeriod;
  customStart: string;
  customEnd: string;
};

type Result = {
  liveData: PerformancePoint[];
  backtest: SymphonyBacktest | null;
  liveSummary: SymphonySummary | null;
  liveAllocations: Record<string, Record<string, number>>;
  tradePreview: SymphonyTradePreview | null;
  tradePreviewRefreshedAt: Date | null;
  loadingLive: boolean;
  loadingBacktest: boolean;
  loadingTradePreview: boolean;
  fetchBacktest: (forceRefresh?: boolean) => Promise<void>;
  fetchTradePreview: () => Promise<void>;
};

export function useSymphonyDetailData({
  symphony,
  period,
  customStart,
  customEnd,
}: Args): Result {
  const [liveSummary, setLiveSummary] = useState<SymphonySummary | null>(null);
  const [liveAllocations, setLiveAllocations] = useState<Record<string, Record<string, number>>>(
    {},
  );

  const {
    liveData,
    setLiveData,
    baseLiveDataRef,
    loadingLive,
  } = useSymphonyLivePerformanceState({
    symphonyId: symphony.id,
    accountId: symphony.account_id,
  });

  const {
    backtest,
    loadingBacktest,
    fetchBacktest,
  } = useSymphonyBacktestState({
    symphonyId: symphony.id,
    accountId: symphony.account_id,
  });

  const {
    tradePreview,
    tradePreviewRefreshedAt,
    loadingTradePreview,
    fetchTradePreview,
  } = useSymphonyTradePreviewState({
    symphonyId: symphony.id,
    accountId: symphony.account_id,
  });

  const oosDate = backtest?.last_semantic_update_at?.slice(0, 10) || "";

  useEffect(() => {
    api
      .getSymphonyAllocations(symphony.id, symphony.account_id)
      .then(setLiveAllocations)
      .catch(() => setLiveAllocations({}));
  }, [symphony.id, symphony.account_id]);

  const refreshLiveMetrics = useCallback(() => {
    if (!isMarketOpen()) return;

    const livePv = symphony.value;
    const base = baseLiveDataRef.current;
    const storedNetDeposits =
      base.length > 0 ? base[base.length - 1].net_deposits : symphony.net_deposits;
    const isOosRange = period === "OOS" && oosDate;
    const selectedPeriod =
      customStart || customEnd || isOosRange
        ? undefined
        : period === "ALL"
          ? undefined
          : period;
    const effectiveStart = customStart || (isOosRange ? oosDate : undefined);

    api
      .getSymphonyLiveSummary(
        symphony.id,
        symphony.account_id,
        livePv,
        storedNetDeposits,
        selectedPeriod,
        effectiveStart || undefined,
        customEnd || undefined,
      )
      .then(setLiveSummary)
      .catch(() => undefined);

    if (base.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastPoint = base[base.length - 1];
    const prevPortfolioValue = lastPoint.portfolio_value;
    const dailyReturnPct =
      prevPortfolioValue > 0 ? ((livePv - prevPortfolioValue) / prevPortfolioValue) * 100 : 0;
    const cumulativeReturnPct =
      storedNetDeposits > 0 ? ((livePv - storedNetDeposits) / storedNetDeposits) * 100 : 0;
    const prevTwr = lastPoint.time_weighted_return || 0;
    const liveTwr = ((1 + prevTwr / 100) * (1 + dailyReturnPct / 100) - 1) * 100;
    const twrPeak = Math.max(
      ...base.map((point) => 1 + (point.time_weighted_return || 0) / 100),
      1 + liveTwr / 100,
    );
    const liveDrawdown = twrPeak > 0 ? ((1 + liveTwr / 100) / twrPeak - 1) * 100 : 0;

    const todayPoint: PerformancePoint = {
      date: today,
      portfolio_value: livePv,
      net_deposits: storedNetDeposits,
      cumulative_return_pct: cumulativeReturnPct,
      daily_return_pct: dailyReturnPct,
      time_weighted_return: liveTwr,
      money_weighted_return: lastPoint.money_weighted_return || 0,
      current_drawdown: Math.min(liveDrawdown, 0),
    };

    if (lastPoint.date === today) {
      setLiveData([...base.slice(0, -1), todayPoint]);
      return;
    }
    setLiveData([...base, todayPoint]);
  }, [
    symphony.id,
    symphony.account_id,
    symphony.value,
    symphony.net_deposits,
    period,
    customStart,
    customEnd,
    oosDate,
    baseLiveDataRef,
    setLiveData,
  ]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!isWithinTradingSession()) return;
      fetchTradePreview().catch(() => undefined);
      refreshLiveMetrics();
    }, 60000);
    return () => clearInterval(intervalId);
  }, [fetchTradePreview, refreshLiveMetrics]);

  useEffect(() => {
    const isOosRange = period === "OOS" && oosDate;
    if (customStart || customEnd || isOosRange) {
      const effectiveStart = customStart || (isOosRange ? oosDate : undefined);
      api
        .getSymphonySummary(
          symphony.id,
          symphony.account_id,
          undefined,
          effectiveStart || undefined,
          customEnd || undefined,
        )
        .then(setLiveSummary)
        .catch(() => setLiveSummary(null));
      return;
    }

    const selectedPeriod = period === "ALL" ? undefined : period;
    api
      .getSymphonySummary(symphony.id, symphony.account_id, selectedPeriod)
      .then(setLiveSummary)
      .catch(() => setLiveSummary(null));
  }, [
    symphony.id,
    symphony.account_id,
    period,
    customStart,
    customEnd,
    oosDate,
  ]);

  return {
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
  };
}
