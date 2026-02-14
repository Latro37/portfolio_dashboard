import { useCallback, useState } from "react";

import { api, SymphonyInfo } from "@/lib/api";

type Args = {
  resolvedAccountId?: string;
  setSymphonies: (symphonies: SymphonyInfo[]) => void;
  applyLiveOverlay: (freshSymphonies: SymphonyInfo[]) => Promise<void>;
};

type Result = {
  symphoniesRefreshing: boolean;
  refreshSymphonies: () => Promise<void>;
};

export function useDashboardSymphonyRefresh({
  resolvedAccountId,
  setSymphonies,
  applyLiveOverlay,
}: Args): Result {
  const [symphoniesRefreshing, setSymphoniesRefreshing] = useState(false);

  const refreshSymphonies = useCallback(async () => {
    setSymphoniesRefreshing(true);
    try {
      const nextSymphonies = await api.getSymphonies(resolvedAccountId);
      setSymphonies(nextSymphonies);
      await applyLiveOverlay(nextSymphonies);
    } catch {
      // Keep existing data if refresh fails.
    } finally {
      setSymphoniesRefreshing(false);
    }
  }, [resolvedAccountId, setSymphonies, applyLiveOverlay]);

  return {
    symphoniesRefreshing,
    refreshSymphonies,
  };
}
