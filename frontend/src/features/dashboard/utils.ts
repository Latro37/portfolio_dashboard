import type { SymphonyInfo } from "@/lib/api";
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

export function summarizeSymphonyDailyChange(symphonies: SymphonyInfo[]) {
  if (!symphonies.length) {
    return {
      todayDollarChange: undefined,
      todayPctChange: undefined,
      totalValue: undefined,
    };
  }

  const totalValue = symphonies.reduce((sum, symphony) => sum + symphony.value, 0);
  const totalDayDollar = symphonies.reduce(
    (sum, symphony) => sum + symphony.last_dollar_change,
    0,
  );
  const priorValue = totalValue - totalDayDollar;
  const todayPctChange = priorValue > 0 ? (totalDayDollar / priorValue) * 100 : 0;

  return {
    totalValue,
    todayDollarChange: totalDayDollar,
    todayPctChange,
  };
}
