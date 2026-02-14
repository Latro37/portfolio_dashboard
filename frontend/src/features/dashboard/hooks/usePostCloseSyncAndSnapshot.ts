import { useCallback } from "react";

import { api } from "@/lib/api";

export function usePostCloseSyncAndSnapshot() {
  const runPostCloseSync = useCallback(async (accountId?: string): Promise<void> => {
    await api.triggerSync(accountId);
  }, []);

  return { runPostCloseSync };
}
