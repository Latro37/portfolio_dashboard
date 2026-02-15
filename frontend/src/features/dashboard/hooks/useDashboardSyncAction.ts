import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

import { showToast } from "@/components/Toast";

type Args = {
  isTestMode: boolean;
  runSyncAndRefresh: () => Promise<void>;
  setError: (message: string | null) => void;
};

type Result = {
  syncing: boolean;
  handleSync: () => Promise<void>;
};

export function useDashboardSyncAction({
  isTestMode,
  runSyncAndRefresh,
  setError,
}: Args): Result {
  const syncMutation = useMutation({
    mutationFn: runSyncAndRefresh,
    onError: () => {
      setError("Sync failed");
    },
  });

  const handleSync = useCallback(async () => {
    if (isTestMode) {
      showToast("Sync is disabled in test mode. Seed test data instead.", "error");
      return;
    }

    await syncMutation.mutateAsync();
  }, [isTestMode, syncMutation]);

  return {
    syncing: syncMutation.isPending,
    handleSync,
  };
}
