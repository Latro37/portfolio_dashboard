import type { PerformancePoint, Summary, SymphonyInfo } from "@/lib/api";
import type { DashboardPeriod } from "@/features/dashboard/types";

export type DashboardRangeParams = {
  period?: DashboardPeriod;
  startDate?: string;
  endDate?: string;
};

export function resolveDashboardRange(
  period: DashboardPeriod,
  customStart: string,
  customEnd: string,
): DashboardRangeParams {
  if (customStart || customEnd) {
    return {
      startDate: customStart || undefined,
      endDate: customEnd || undefined,
    };
  }
  return { period };
}

export function summarizePortfolioDailyChange(
  performance: PerformancePoint[],
  summary: Summary | null,
) {
  if (performance.length < 2) {
    return {
      todayDollarChange: undefined,
      todayPctChange: summary?.daily_return_pct,
    };
  }

  const last = performance[performance.length - 1];
  const prev = performance[performance.length - 2];
  const netDepositDelta = last.net_deposits - prev.net_deposits;
  const todayDollarChange =
    last.portfolio_value - prev.portfolio_value - netDepositDelta;
  const todayPctChange =
    prev.portfolio_value > 0
      ? (todayDollarChange / prev.portfolio_value) * 100
      : (summary?.daily_return_pct ?? 0);

  return {
    todayDollarChange,
    todayPctChange,
  };
}

export function summarizeSymphonyValue(symphonies: SymphonyInfo[]) {
  if (!symphonies.length) return undefined;
  return symphonies.reduce((sum, symphony) => sum + symphony.value, 0);
}
