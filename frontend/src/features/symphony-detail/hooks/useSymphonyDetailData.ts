import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  PerformancePoint,
  SymphonyBacktest,
  SymphonyInfo,
  SymphonySummary,
  SymphonyTradePreview,
} from "@/lib/api";
import {
  getSymphonyAllocationsQueryFn,
  getSymphonySummaryLiveQueryFn,
  getSymphonySummaryQueryFn,
} from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";
import { isMarketOpen, isWithinTradingSession } from "@/lib/marketHours";
import { useSymphonyBacktestState } from "@/features/symphony-detail/hooks/useSymphonyBacktestState";
import { useSymphonyLivePerformanceState } from "@/features/symphony-detail/hooks/useSymphonyLivePerformanceState";
import { useSymphonyTradePreviewState } from "@/features/symphony-detail/hooks/useSymphonyTradePreviewState";
import { buildLivePerformanceOverlay } from "@/features/symphony-detail/hooks/symphonyLiveOverlay";
import { SymphonyDetailPeriod } from "@/features/symphony-detail/types";

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

type ScopedSummaryOverride = {
  scopeKey: string;
  value: SymphonySummary | null;
} | null;

export function useSymphonyDetailData({
  symphony,
  period,
  customStart,
  customEnd,
}: Args): Result {
  const [liveSummaryOverride, setLiveSummaryOverride] = useState<ScopedSummaryOverride>(null);
  const {
    liveData,
    setLiveData,
    baseLiveDataRef,
    loadingLive,
  } = useSymphonyLivePerformanceState({
    symphonyId: symphony.id,
    accountId: symphony.account_id,
  });

  const { backtest, loadingBacktest, fetchBacktest } = useSymphonyBacktestState({
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
  const isOosRange = period === "OOS" && Boolean(oosDate);
  const selectedPeriod =
    customStart || customEnd || isOosRange
      ? undefined
      : period === "ALL"
        ? undefined
        : period;
  const effectiveStart = customStart || (isOosRange ? oosDate : undefined);
  const summaryScopeKey = `${symphony.id}|${symphony.account_id}|${selectedPeriod ?? ""}|${effectiveStart ?? ""}|${customEnd || ""}`;

  const summaryQuery = useQuery({
    queryKey: queryKeys.symphonySummary({
      symphonyId: symphony.id,
      accountId: symphony.account_id,
      period: selectedPeriod,
      startDate: effectiveStart,
      endDate: customEnd || undefined,
    }),
    queryFn: async () => {
      try {
        return await getSymphonySummaryQueryFn({
          symphonyId: symphony.id,
          accountId: symphony.account_id,
          period: selectedPeriod,
          startDate: effectiveStart,
          endDate: customEnd || undefined,
        });
      } catch {
        return null;
      }
    },
    staleTime: 60000,
  });

  const allocationsQuery = useQuery({
    queryKey: queryKeys.symphonyAllocations({
      symphonyId: symphony.id,
      accountId: symphony.account_id,
    }),
    queryFn: async () => {
      try {
        return await getSymphonyAllocationsQueryFn({
          symphonyId: symphony.id,
          accountId: symphony.account_id,
        });
      } catch {
        return {};
      }
    },
    staleTime: 60000,
  });

  const liveSummary = useMemo(() => {
    if (liveSummaryOverride && liveSummaryOverride.scopeKey === summaryScopeKey) {
      return liveSummaryOverride.value;
    }
    return summaryQuery.data ?? null;
  }, [liveSummaryOverride, summaryScopeKey, summaryQuery.data]);

  const refreshLiveMetrics = useCallback(() => {
    if (!isMarketOpen()) return;

    const livePv = symphony.value;
    const liveNd = symphony.net_deposits;
    const base = baseLiveDataRef.current;

    getSymphonySummaryLiveQueryFn({
      symphonyId: symphony.id,
      accountId: symphony.account_id,
      livePv,
      liveNd,
      period: selectedPeriod,
      startDate: effectiveStart,
      endDate: customEnd || undefined,
    })
      .then((nextSummary) => {
        setLiveSummaryOverride({
          scopeKey: summaryScopeKey,
          value: nextSummary,
        });
      })
      .catch(() => undefined);

    if (base.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    setLiveData(buildLivePerformanceOverlay({ base, livePv, liveNd, today }));
  }, [
    symphony.id,
    symphony.account_id,
    symphony.value,
    symphony.net_deposits,
    selectedPeriod,
    effectiveStart,
    customEnd,
    summaryScopeKey,
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

  return {
    liveData,
    backtest,
    liveSummary,
    liveAllocations: allocationsQuery.data ?? {},
    tradePreview,
    tradePreviewRefreshedAt,
    loadingLive,
    loadingBacktest,
    loadingTradePreview,
    fetchBacktest,
    fetchTradePreview,
  };
}
