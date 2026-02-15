import { useCallback, useState } from "react";

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
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (isTestMode) {
      showToast("Sync is disabled in test mode. Seed test data instead.", "error");
      return;
    }

    setSyncing(true);
    try {
      await runSyncAndRefresh();
    } catch {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [isTestMode, runSyncAndRefresh, setError]);

  return {
    syncing,
    handleSync,
  };
}
