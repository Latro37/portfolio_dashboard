import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getSyncStatusQueryFn } from "@/lib/queryFns";
import { invalidateAfterSync } from "@/lib/queryInvalidation";
import { queryKeys } from "@/lib/queryKeys";

type Args = {
  resolvedAccountId?: string;
};

export function useSyncCompletionRefresh({ resolvedAccountId }: Args) {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<string | null>(null);

  const syncStatusQuery = useQuery({
    queryKey: queryKeys.syncStatus(resolvedAccountId),
    queryFn: () => getSyncStatusQueryFn(resolvedAccountId),
    enabled: Boolean(resolvedAccountId),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === "syncing" ? 1000 : false,
  });

  useEffect(() => {
    const status = syncStatusQuery.data?.status;
    if (!status) return;

    const prev = prevStatusRef.current;
    if (prev === "syncing" && status === "idle") {
      void invalidateAfterSync(queryClient, resolvedAccountId);
    }

    prevStatusRef.current = status;
  }, [syncStatusQuery.data?.status, queryClient, resolvedAccountId]);
}

