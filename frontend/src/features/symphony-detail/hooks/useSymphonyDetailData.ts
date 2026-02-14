import { useCallback } from "react";

import { api } from "@/lib/api";

export function useSymphonyDetailData() {
  const loadSymphonyLive = useCallback((symphonyId: string, accountId: string) => {
    return api.getSymphonyPerformance(symphonyId, accountId);
  }, []);

  const loadSymphonySummary = useCallback((symphonyId: string, accountId: string, period?: string) => {
    return api.getSymphonySummary(symphonyId, accountId, period);
  }, []);

  return {
    loadSymphonyLive,
    loadSymphonySummary,
  };
}
