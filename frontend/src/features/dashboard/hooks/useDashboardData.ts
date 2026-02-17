import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  HoldingsResponse,
  PerformancePoint,
  Summary,
  SymphonyInfo,
} from "@/lib/api";
import {
  getHoldingsQueryFn,
  getPerformanceQueryFn,
  getSummaryQueryFn,
  getSymphoniesQueryFn,
} from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";
import type { DashboardPeriod } from "@/features/dashboard/types";
import { resolveDashboardRange } from "@/features/dashboard/utils";

type Args = {
  resolvedAccountId?: string;
  period: DashboardPeriod;
  customStart: string;
  customEnd: string;
};

type Result = {
  summary: Summary | null;
  performance: PerformancePoint[];
  holdings: HoldingsResponse | null;
  holdingsLastUpdated: Date | null;
  symphonies: SymphonyInfo[];
  summaryIsPlaceholderData: boolean;
  performanceIsPlaceholderData: boolean;
  loading: boolean;
  error: string | null;
  setSummary: Dispatch<SetStateAction<Summary | null>>;
  setPerformance: Dispatch<SetStateAction<PerformancePoint[]>>;
  setHoldings: Dispatch<SetStateAction<HoldingsResponse | null>>;
  setHoldingsLastUpdated: Dispatch<SetStateAction<Date | null>>;
  setSymphonies: Dispatch<SetStateAction<SymphonyInfo[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  baseSummaryRef: RefObject<Summary | null>;
  basePerformanceRef: RefObject<PerformancePoint[]>;
  fetchData: () => Promise<void>;
  resetForAccountChange: () => void;
  restoreBaseData: () => void;
};

type ScopedOverride<T> = {
  scopeKey: string;
  value: T;
};

function applySetStateAction<T>(previous: T, value: SetStateAction<T>): T {
  return typeof value === "function"
    ? (value as (prevState: T) => T)(previous)
    : value;
}

export function useDashboardData({
  resolvedAccountId,
  period,
  customStart,
  customEnd,
}: Args): Result {
  const [summaryOverride, setSummaryOverride] = useState<
    ScopedOverride<Summary | null> | undefined
  >(undefined);
  const [performanceOverride, setPerformanceOverride] = useState<
    ScopedOverride<PerformancePoint[]> | undefined
  >(undefined);
  const [holdingsOverride, setHoldingsOverride] = useState<
    HoldingsResponse | null | undefined
  >(undefined);
  const [symphoniesOverride, setSymphoniesOverride] = useState<
    SymphonyInfo[] | undefined
  >(undefined);
  const [holdingsLastUpdatedOverride, setHoldingsLastUpdatedOverride] = useState<Date | null>(
    null,
  );
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const baseHoldingsRef = useRef<HoldingsResponse | null>(null);
  const basePerformanceRef = useRef<PerformancePoint[]>([]);
  const baseSummaryRef = useRef<Summary | null>(null);
  const range = useMemo(
    () => resolveDashboardRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );
  const scopeKey = useMemo(
    () =>
      [resolvedAccountId ?? "__none__", range.period, range.startDate, range.endDate].join("|"),
    [resolvedAccountId, range.period, range.startDate, range.endDate],
  );

  const summaryQuery = useQuery({
    queryKey: queryKeys.summary({
      accountId: resolvedAccountId,
      period: range.period,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    queryFn: () =>
      getSummaryQueryFn({
        accountId: resolvedAccountId,
        period: range.period,
        startDate: range.startDate,
        endDate: range.endDate,
      }),
    enabled: Boolean(resolvedAccountId),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  });

  const holdingsQuery = useQuery({
    queryKey: queryKeys.holdings(resolvedAccountId),
    queryFn: () => getHoldingsQueryFn(resolvedAccountId),
    enabled: Boolean(resolvedAccountId),
    staleTime: 60000,
  });

  const performanceQuery = useQuery({
    queryKey: queryKeys.performance({
      accountId: resolvedAccountId,
      period: range.period,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
    queryFn: async () => {
      try {
        return await getPerformanceQueryFn({
          accountId: resolvedAccountId,
          period: range.period,
          startDate: range.startDate,
          endDate: range.endDate,
        });
      } catch {
        return [] as PerformancePoint[];
      }
    },
    enabled: Boolean(resolvedAccountId),
    staleTime: 60000,
    placeholderData: keepPreviousData,
  });

  const symphoniesQuery = useQuery({
    queryKey: queryKeys.symphonies(resolvedAccountId),
    queryFn: async () => {
      try {
        return await getSymphoniesQueryFn(resolvedAccountId);
      } catch {
        return [] as SymphonyInfo[];
      }
    },
    enabled: Boolean(resolvedAccountId),
    staleTime: 60000,
  });

  useEffect(() => {
    if (!summaryQuery.data) return;
    baseSummaryRef.current = summaryQuery.data;
  }, [summaryQuery.data]);

  useEffect(() => {
    if (!holdingsQuery.data) return;
    baseHoldingsRef.current = holdingsQuery.data;
  }, [holdingsQuery.data]);

  useEffect(() => {
    if (!performanceQuery.data) return;
    basePerformanceRef.current = performanceQuery.data;
  }, [performanceQuery.data]);

  const summary =
    summaryOverride !== undefined && summaryOverride.scopeKey === scopeKey
      ? summaryOverride.value
      : summaryQuery.data ?? null;
  const holdings =
    holdingsOverride !== undefined
      ? holdingsOverride
      : holdingsQuery.data ?? null;
  const performance =
    performanceOverride !== undefined && performanceOverride.scopeKey === scopeKey
      ? performanceOverride.value
      : performanceQuery.data ?? [];
  const symphonies =
    symphoniesOverride !== undefined
      ? symphoniesOverride
      : symphoniesQuery.data ?? [];
  const holdingsLastUpdated =
    holdingsLastUpdatedOverride ??
    (holdingsQuery.data ? new Date(holdingsQuery.dataUpdatedAt) : null);
  const summaryIsPlaceholderData = summaryQuery.isPlaceholderData;
  const performanceIsPlaceholderData = performanceQuery.isPlaceholderData;

  const queryError = summaryQuery.error?.message ?? holdingsQuery.error?.message ?? null;
  const error = manualError ?? queryError;

  const hasSummaryData = summaryQuery.data != null;
  const hasHoldingsData = holdingsQuery.data != null;
  const hasPerformanceData = performanceQuery.data != null;
  const hasSymphonyData = symphoniesQuery.data != null;

  const hasPendingCriticalRead =
    Boolean(resolvedAccountId) &&
    ((!hasSummaryData && (summaryQuery.isLoading || summaryQuery.isFetching)) ||
      (!hasHoldingsData && (holdingsQuery.isLoading || holdingsQuery.isFetching)) ||
      (!hasPerformanceData &&
        (performanceQuery.isLoading || performanceQuery.isFetching)) ||
      (!hasSymphonyData && (symphoniesQuery.isLoading || symphoniesQuery.isFetching)));
  const loading = !resolvedAccountId || hasPendingCriticalRead || (manualLoading && hasPendingCriticalRead);

  const setSummary: Dispatch<SetStateAction<Summary | null>> = useCallback(
    (value) => {
      setSummaryOverride((previous) =>
        ({
          scopeKey,
          value: applySetStateAction(
            previous?.scopeKey === scopeKey ? previous.value : summaryQuery.data ?? null,
            value,
          ),
        }),
      );
    },
    [scopeKey, summaryQuery.data],
  );

  const setPerformance: Dispatch<SetStateAction<PerformancePoint[]>> = useCallback(
    (value) => {
      setPerformanceOverride((previous) =>
        ({
          scopeKey,
          value: applySetStateAction(
            previous?.scopeKey === scopeKey ? previous.value : performanceQuery.data ?? [],
            value,
          ),
        }),
      );
    },
    [scopeKey, performanceQuery.data],
  );

  const setHoldings: Dispatch<SetStateAction<HoldingsResponse | null>> = useCallback(
    (value) => {
      setHoldingsOverride((previous) =>
        applySetStateAction(previous !== undefined ? previous : holdingsQuery.data ?? null, value),
      );
    },
    [holdingsQuery.data],
  );

  const setSymphonies: Dispatch<SetStateAction<SymphonyInfo[]>> = useCallback(
    (value) => {
      setSymphoniesOverride((previous) =>
        applySetStateAction(
          previous !== undefined ? previous : symphoniesQuery.data ?? [],
          value,
        ),
      );
    },
    [symphoniesQuery.data],
  );

  const setLoading: Dispatch<SetStateAction<boolean>> = useCallback((value) => {
    setManualLoading((previous) => applySetStateAction(previous, value));
  }, []);

  const setError: Dispatch<SetStateAction<string | null>> = useCallback((value) => {
    setManualError((previous) => applySetStateAction(previous, value));
  }, []);

  const refetchSummary = summaryQuery.refetch;
  const refetchHoldings = holdingsQuery.refetch;
  const refetchPerformance = performanceQuery.refetch;
  const refetchSymphonies = symphoniesQuery.refetch;

  const fetchData = useCallback(async () => {
    if (!resolvedAccountId) return;
    setManualError(null);
    setManualLoading(true);

    const [nextSummary, nextHoldings] = await Promise.all([
      refetchSummary(),
      refetchHoldings(),
      refetchPerformance(),
      refetchSymphonies(),
    ]);

    if (nextSummary.error) {
      setManualError(nextSummary.error.message);
    } else if (nextHoldings.error) {
      setManualError(nextHoldings.error.message);
    } else {
      setSummaryOverride(undefined);
      setHoldingsOverride(undefined);
      setPerformanceOverride(undefined);
      setSymphoniesOverride(undefined);
      setHoldingsLastUpdatedOverride(null);
      setManualError(null);
    }
    setManualLoading(false);
  }, [
    resolvedAccountId,
    refetchSummary,
    refetchHoldings,
    refetchPerformance,
    refetchSymphonies,
  ]);

  const resetForAccountChange = useCallback(() => {
    setSummaryOverride(undefined);
    setPerformanceOverride(undefined);
    setHoldingsOverride(undefined);
    setSymphoniesOverride(undefined);
    setHoldingsLastUpdatedOverride(null);
    setManualError(null);
    setManualLoading(true);
  }, []);

  const restoreBaseData = useCallback(() => {
    setSummaryOverride({ scopeKey, value: baseSummaryRef.current });
    setHoldingsOverride(baseHoldingsRef.current);
    setPerformanceOverride({ scopeKey, value: basePerformanceRef.current });
  }, [scopeKey]);

  return {
    summary,
    performance,
    holdings,
    holdingsLastUpdated,
    symphonies,
    summaryIsPlaceholderData,
    performanceIsPlaceholderData,
    loading,
    error,
    setSummary,
    setPerformance,
    setHoldings,
    setHoldingsLastUpdated: setHoldingsLastUpdatedOverride,
    setSymphonies,
    setLoading,
    setError,
    baseSummaryRef,
    basePerformanceRef,
    fetchData,
    resetForAccountChange,
    restoreBaseData,
  };
}
