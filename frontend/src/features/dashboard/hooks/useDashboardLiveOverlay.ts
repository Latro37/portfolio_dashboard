import { type RefObject, useCallback } from "react";

import {
  api,
  HoldingsResponse,
  PerformancePoint,
  Summary,
  SymphonyInfo,
} from "@/lib/api";
import { isMarketOpen } from "@/lib/marketHours";
import type { DashboardPeriod } from "@/features/dashboard/types";
import { resolveDashboardRange } from "@/features/dashboard/utils";

type Args = {
  liveEnabled: boolean;
  resolvedAccountId?: string;
  period: DashboardPeriod;
  customStart: string;
  customEnd: string;
  baseSummaryRef: RefObject<Summary | null>;
  basePerformanceRef: RefObject<PerformancePoint[]>;
  setSummary: (summary: Summary) => void;
  setPerformance: (data: PerformancePoint[]) => void;
  setHoldings: (holdings: HoldingsResponse) => void;
  setHoldingsLastUpdated: (updatedAt: Date) => void;
};

export function useDashboardLiveOverlay({
  liveEnabled,
  resolvedAccountId,
  period,
  customStart,
  customEnd,
  baseSummaryRef,
  basePerformanceRef,
  setSummary,
  setPerformance,
  setHoldings,
  setHoldingsLastUpdated,
}: Args) {
  const applyLivePoint = useCallback(
    (base: PerformancePoint[], todayPoint: PerformancePoint): PerformancePoint[] => {
      if (!base.length) return [todayPoint];
      const next = [...base];
      const last = next[next.length - 1];
      if (last.date === todayPoint.date) {
        next[next.length - 1] = todayPoint;
        return next;
      }
      next.push(todayPoint);
      return next;
    },
    [],
  );

  const applyLiveOverlay = useCallback(
    async (freshSymphonies: SymphonyInfo[]) => {
      if (
        !liveEnabled ||
        !isMarketOpen() ||
        !resolvedAccountId ||
        freshSymphonies.length === 0
      ) {
        return;
      }

      const livePortfolioValue = freshSymphonies.reduce(
        (sum, symphony) => sum + symphony.value,
        0,
      );
      const base = basePerformanceRef.current;
      const storedNetDeposits =
        base.length > 0
          ? base[base.length - 1].net_deposits
          : (baseSummaryRef.current?.net_deposits ?? 0);
      const range = resolveDashboardRange(period, customStart, customEnd);

      try {
        const liveSummary = await api.getLiveSummary(
          resolvedAccountId,
          livePortfolioValue,
          storedNetDeposits,
          range.period,
          range.startDate,
          range.endDate,
        );
        setSummary(liveSummary);
      } catch {
        // Keep base summary if live endpoint is unavailable.
      }

      if (base.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const lastPoint = base[base.length - 1];
        const prevPortfolioValue = lastPoint.portfolio_value;
        const dailyReturnPct =
          prevPortfolioValue > 0
            ? ((livePortfolioValue - prevPortfolioValue) / prevPortfolioValue) * 100
            : 0;
        const cumulativeReturnPct =
          storedNetDeposits > 0
            ? ((livePortfolioValue - storedNetDeposits) / storedNetDeposits) * 100
            : 0;
        const prevTwr = lastPoint.time_weighted_return || 0;
        const liveTwr = ((1 + prevTwr / 100) * (1 + dailyReturnPct / 100) - 1) * 100;
        const twrPeak = Math.max(
          ...base.map((point) => 1 + (point.time_weighted_return || 0) / 100),
          1 + liveTwr / 100,
        );
        const liveDrawdown =
          twrPeak > 0 ? ((1 + liveTwr / 100) / twrPeak - 1) * 100 : 0;

        const todayPoint: PerformancePoint = {
          date: today,
          portfolio_value: livePortfolioValue,
          net_deposits: storedNetDeposits,
          cumulative_return_pct: cumulativeReturnPct,
          daily_return_pct: dailyReturnPct,
          time_weighted_return: liveTwr,
          money_weighted_return: lastPoint.money_weighted_return || 0,
          current_drawdown: Math.min(liveDrawdown, 0),
        };

        setPerformance(applyLivePoint(base, todayPoint));
      }

      const holdingMap = new Map<string, number>();
      for (const symphony of freshSymphonies) {
        for (const holding of symphony.holdings) {
          holdingMap.set(
            holding.ticker,
            (holdingMap.get(holding.ticker) ?? 0) + holding.value,
          );
        }
      }

      if (holdingMap.size > 0) {
        const totalValue = Array.from(holdingMap.values()).reduce(
          (sum, value) => sum + value,
          0,
        );
        const liveHoldings: HoldingsResponse = {
          date: new Date().toISOString().slice(0, 10),
          holdings: Array.from(holdingMap.entries())
            .map(([symbol, marketValue]) => ({
              symbol,
              quantity: 0,
              market_value: marketValue,
              allocation_pct: totalValue > 0 ? (marketValue / totalValue) * 100 : 0,
            }))
            .sort((a, b) => b.market_value - a.market_value),
        };
        setHoldings(liveHoldings);
        setHoldingsLastUpdated(new Date());
      }
    },
    [
      liveEnabled,
      resolvedAccountId,
      period,
      customStart,
      customEnd,
      baseSummaryRef,
      basePerformanceRef,
      setSummary,
      setPerformance,
      setHoldings,
      setHoldingsLastUpdated,
      applyLivePoint,
    ],
  );

  return { applyLiveOverlay };
}
