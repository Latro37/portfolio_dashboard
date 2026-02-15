import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { SymphonyBacktest } from "@/lib/api";
import { getSymphonyBacktestQueryFn, queryRetryOverrides } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

type Args = {
  symphonyId: string;
  accountId: string;
};

type Result = {
  backtest: SymphonyBacktest | null;
  loadingBacktest: boolean;
  fetchBacktest: (forceRefresh?: boolean) => Promise<void>;
};

export function useSymphonyBacktestState({
  symphonyId,
  accountId,
}: Args): Result {
  const queryClient = useQueryClient();
  const [manualLoading, setManualLoading] = useState(false);
  const key = queryKeys.symphonyBacktest({ symphonyId, accountId });
  const backtestQuery = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return await getSymphonyBacktestQueryFn({ symphonyId, accountId });
      } catch {
        return null;
      }
    },
    staleTime: 900000,
    ...queryRetryOverrides.symphonyBacktest,
  });
  const refetchBacktest = backtestQuery.refetch;

  const fetchBacktest = useCallback(
    async (forceRefresh = false) => {
      setManualLoading(true);
      try {
        if (forceRefresh) {
          const fresh = await getSymphonyBacktestQueryFn(
            { symphonyId, accountId },
            true,
          ).catch(() => null);
          queryClient.setQueryData(key, fresh);
          return;
        }
        await refetchBacktest();
      } finally {
        setManualLoading(false);
      }
    },
    [symphonyId, accountId, queryClient, key, refetchBacktest],
  );

  return {
    backtest: backtestQuery.data ?? null,
    loadingBacktest: backtestQuery.isLoading || backtestQuery.isFetching || manualLoading,
    fetchBacktest,
  };
}
