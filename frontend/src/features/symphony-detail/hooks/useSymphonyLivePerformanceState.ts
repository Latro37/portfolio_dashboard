import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { PerformancePoint } from "@/lib/api";
import { getSymphonyPerformanceQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

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

type ScopedLiveOverride = {
  scopeKey: string;
  data: PerformancePoint[];
} | null;

function applySetStateAction<T>(previous: T, value: SetStateAction<T>): T {
  return typeof value === "function"
    ? (value as (prevState: T) => T)(previous)
    : value;
}

export function useSymphonyLivePerformanceState({
  symphonyId,
  accountId,
}: Args): Result {
  const scopeKey = `${symphonyId}:${accountId}`;
  const [liveDataOverride, setLiveDataOverride] = useState<ScopedLiveOverride>(null);
  const baseLiveDataRef = useRef<PerformancePoint[]>([]);
  const liveQuery = useQuery({
    queryKey: queryKeys.symphonyPerformance({ symphonyId, accountId }),
    queryFn: async () => {
      try {
        return await getSymphonyPerformanceQueryFn({ symphonyId, accountId });
      } catch {
        return [] as PerformancePoint[];
      }
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (!liveQuery.data) return;
    baseLiveDataRef.current = liveQuery.data;
  }, [liveQuery.data]);

  const liveData = useMemo(() => {
    if (liveDataOverride && liveDataOverride.scopeKey === scopeKey) {
      return liveDataOverride.data;
    }
    return liveQuery.data ?? [];
  }, [liveDataOverride, scopeKey, liveQuery.data]);

  const setLiveData: Dispatch<SetStateAction<PerformancePoint[]>> = useCallback(
    (value) => {
      setLiveDataOverride((previous) => {
        const base =
          previous && previous.scopeKey === scopeKey
            ? previous.data
            : liveQuery.data ?? [];
        return {
          scopeKey,
          data: applySetStateAction(base, value),
        };
      });
    },
    [scopeKey, liveQuery.data],
  );

  return {
    liveData,
    setLiveData,
    baseLiveDataRef,
    loadingLive: liveQuery.isLoading || liveQuery.isFetching,
  };
}
