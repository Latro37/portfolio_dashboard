import { useCallback } from "react";

import { api, PerformancePoint, Summary } from "@/lib/api";

type Result = {
  summary: Summary;
  performance: PerformancePoint[];
};

export function useDashboardData() {
  const loadDashboardData = useCallback(
    async (
      accountId?: string,
      period?: string,
      startDate?: string,
      endDate?: string,
    ): Promise<Result> => {
      const [summary, performance] = await Promise.all([
        api.getSummary(accountId, period, startDate, endDate),
        api.getPerformance(accountId, period, startDate, endDate),
      ]);
      return { summary, performance };
    },
    [],
  );

  return { loadDashboardData };
}
