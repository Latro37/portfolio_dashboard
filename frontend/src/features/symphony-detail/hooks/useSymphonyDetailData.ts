import { useCallback, useEffect, useRef, useState } from "react";

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
  const [liveData, setLiveData] = useState<PerformancePoint[]>([]);
  const [backtest, setBacktest] = useState<SymphonyBacktest | null>(null);
  const [liveSummary, setLiveSummary] = useState<SymphonySummary | null>(null);
  const [liveAllocations, setLiveAllocations] = useState<
    Record<string, Record<string, number>>
  >({});
  const [tradePreview, setTradePreview] = useState<SymphonyTradePreview | null>(
    null,
  );
  const [tradePreviewRefreshedAt, setTradePreviewRefreshedAt] =
    useState<Date | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [loadingBacktest, setLoadingBacktest] = useState(true);
  const [loadingTradePreview, setLoadingTradePreview] = useState(true);
  const baseLiveDataRef = useRef<PerformancePoint[]>([]);
  const oosDate = backtest?.last_semantic_update_at?.slice(0, 10) || "";

  useEffect(() => {
    let active = true;
    api
      .getSymphonyPerformance(symphony.id, symphony.account_id)
      .then((data) => {
        if (!active) return;
        setLiveData(data);
        baseLiveDataRef.current = data;
      })
      .catch(() => {
        if (!active) return;
        setLiveData([]);
        baseLiveDataRef.current = [];
      })
      .finally(() => {
        if (active) setLoadingLive(false);
      });
    return () => {
      active = false;
    };
  }, [symphony.id, symphony.account_id]);

  const loadBacktest = useCallback(
    (forceRefresh = false) =>
      api
        .getSymphonyBacktest(symphony.id, symphony.account_id, forceRefresh)
        .then(setBacktest)
        .catch(() => setBacktest(null)),
    [symphony.id, symphony.account_id],
  );

  const fetchBacktest = useCallback(
    async (forceRefresh = false) => {
      setLoadingBacktest(true);
      try {
        await loadBacktest(forceRefresh);
      } finally {
        setLoadingBacktest(false);
      }
    },
    [loadBacktest],
  );

  useEffect(() => {
    let active = true;
    loadBacktest().finally(() => {
      if (active) setLoadingBacktest(false);
    });
    return () => {
      active = false;
    };
  }, [loadBacktest]);

  useEffect(() => {
    api
      .getSymphonyAllocations(symphony.id, symphony.account_id)
      .then(setLiveAllocations)
      .catch(() => setLiveAllocations({}));
  }, [symphony.id, symphony.account_id]);

  const loadTradePreview = useCallback(
    () =>
      api
        .getSymphonyTradePreview(symphony.id, symphony.account_id)
        .then((data) => {
          setTradePreview(data);
          setTradePreviewRefreshedAt(new Date());
        })
        .catch(() => setTradePreview(null)),
    [symphony.id, symphony.account_id],
  );

  const fetchTradePreview = useCallback(async () => {
    setLoadingTradePreview(true);
    try {
      await loadTradePreview();
    } finally {
      setLoadingTradePreview(false);
    }
  }, [loadTradePreview]);

  useEffect(() => {
    let active = true;
    loadTradePreview().finally(() => {
      if (active) setLoadingTradePreview(false);
    });
    return () => {
      active = false;
    };
  }, [loadTradePreview]);

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
