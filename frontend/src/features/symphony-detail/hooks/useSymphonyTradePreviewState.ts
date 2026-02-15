import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import { SymphonyTradePreview } from "@/lib/api";
import { getSymphonyTradePreviewQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

type Args = {
  symphonyId: string;
  accountId: string;
};

type Result = {
  tradePreview: SymphonyTradePreview | null;
  tradePreviewRefreshedAt: Date | null;
  loadingTradePreview: boolean;
  fetchTradePreview: () => Promise<void>;
};

export function useSymphonyTradePreviewState({
  symphonyId,
  accountId,
}: Args): Result {
  const tradePreviewQuery = useQuery({
    queryKey: queryKeys.symphonyTradePreview({ symphonyId, accountId }),
    queryFn: async () => {
      try {
        return await getSymphonyTradePreviewQueryFn({ symphonyId, accountId });
      } catch {
        return null;
      }
    },
    staleTime: 30000,
  });
  const refetchTradePreview = tradePreviewQuery.refetch;

  const fetchTradePreview = useCallback(async () => {
    await refetchTradePreview();
  }, [refetchTradePreview]);

  return {
    tradePreview: tradePreviewQuery.data ?? null,
    tradePreviewRefreshedAt:
      tradePreviewQuery.data != null
        ? new Date(tradePreviewQuery.dataUpdatedAt)
        : null,
    loadingTradePreview: tradePreviewQuery.isLoading || tradePreviewQuery.isFetching,
    fetchTradePreview,
  };
}
