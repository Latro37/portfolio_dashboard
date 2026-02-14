import { useCallback, useEffect, useState } from "react";

import { api, SymphonyTradePreview } from "@/lib/api";

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
  const [tradePreview, setTradePreview] = useState<SymphonyTradePreview | null>(null);
  const [tradePreviewRefreshedAt, setTradePreviewRefreshedAt] = useState<Date | null>(null);
  const [loadingTradePreview, setLoadingTradePreview] = useState(true);

  const loadTradePreview = useCallback(
    () =>
      api
        .getSymphonyTradePreview(symphonyId, accountId)
        .then((data) => {
          setTradePreview(data);
          setTradePreviewRefreshedAt(new Date());
        })
        .catch(() => setTradePreview(null)),
    [symphonyId, accountId],
  );

  const fetchTradePreview = useCallback(async () => {
    setLoadingTradePreview(true);
    try {
      await loadTradePreview();
    } finally {
      setLoadingTradePreview(false);
    }
  }, [loadTradePreview]);

  useEffect(() => {
    let active = true;
    loadTradePreview().finally(() => {
      if (active) setLoadingTradePreview(false);
    });
    return () => {
      active = false;
    };
  }, [loadTradePreview]);

  return {
    tradePreview,
    tradePreviewRefreshedAt,
    loadingTradePreview,
    fetchTradePreview,
  };
}
