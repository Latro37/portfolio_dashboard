import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { SymphonyInfo } from "@/lib/api";
import { getSymphoniesQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

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
  const queryClient = useQueryClient();

  const refreshSymphonies = useCallback(async () => {
    setSymphoniesRefreshing(true);
    try {
      const nextSymphonies = await queryClient.fetchQuery({
        queryKey: queryKeys.symphonies(resolvedAccountId),
        queryFn: () => getSymphoniesQueryFn(resolvedAccountId),
        staleTime: 60000,
      });
      setSymphonies(nextSymphonies);
      await applyLiveOverlay(nextSymphonies);
    } catch {
      // Keep existing data if refresh fails.
    } finally {
      setSymphoniesRefreshing(false);
    }
  }, [queryClient, resolvedAccountId, setSymphonies, applyLiveOverlay]);

  return {
    symphoniesRefreshing,
    refreshSymphonies,
  };
}
