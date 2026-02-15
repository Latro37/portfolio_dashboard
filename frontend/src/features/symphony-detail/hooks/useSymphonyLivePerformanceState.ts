import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState } from "react";

import { api, PerformancePoint } from "@/lib/api";

type Args = {
  symphonyId: string;
  accountId: string;
};

type Result = {
  liveData: PerformancePoint[];
  setLiveData: Dispatch<SetStateAction<PerformancePoint[]>>;
  baseLiveDataRef: MutableRefObject<PerformancePoint[]>;
  loadingLive: boolean;
};

export function useSymphonyLivePerformanceState({
  symphonyId,
  accountId,
}: Args): Result {
  const [liveData, setLiveData] = useState<PerformancePoint[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);
  const baseLiveDataRef = useRef<PerformancePoint[]>([]);

  useEffect(() => {
    let active = true;
    api
      .getSymphonyPerformance(symphonyId, accountId)
      .then((data) => {
        if (!active) return;
        setLiveData(data);
        baseLiveDataRef.current = data;
      })
      .catch(() => {
        if (!active) return;
        setLiveData([]);
        baseLiveDataRef.current = [];
      })
      .finally(() => {
        if (active) setLoadingLive(false);
      });
    return () => {
      active = false;
    };
  }, [symphonyId, accountId]);

  return {
    liveData,
    setLiveData,
    baseLiveDataRef,
    loadingLive,
  };
}
