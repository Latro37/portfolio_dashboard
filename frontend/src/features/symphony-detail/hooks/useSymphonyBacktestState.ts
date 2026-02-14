import { useCallback, useEffect, useState } from "react";

import { api, SymphonyBacktest } from "@/lib/api";

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
  const [backtest, setBacktest] = useState<SymphonyBacktest | null>(null);
  const [loadingBacktest, setLoadingBacktest] = useState(true);

  const loadBacktest = useCallback(
    (forceRefresh = false) =>
      api
        .getSymphonyBacktest(symphonyId, accountId, forceRefresh)
        .then(setBacktest)
        .catch(() => setBacktest(null)),
    [symphonyId, accountId],
  );

  const fetchBacktest = useCallback(
    async (forceRefresh = false) => {
      setLoadingBacktest(true);
      try {
        await loadBacktest(forceRefresh);
      } finally {
        setLoadingBacktest(false);
      }
    },
    [loadBacktest],
  );

  useEffect(() => {
    let active = true;
    loadBacktest().finally(() => {
      if (active) setLoadingBacktest(false);
    });
    return () => {
      active = false;
    };
  }, [loadBacktest]);

  return {
    backtest,
    loadingBacktest,
    fetchBacktest,
  };
}
