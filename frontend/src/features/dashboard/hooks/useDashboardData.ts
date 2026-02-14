import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  api,
  HoldingsResponse,
  PerformancePoint,
  Summary,
  SymphonyInfo,
} from "@/lib/api";
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

export function useDashboardData({
  resolvedAccountId,
  period,
  customStart,
  customEnd,
}: Args): Result {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [performance, setPerformance] = useState<PerformancePoint[]>([]);
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [holdingsLastUpdated, setHoldingsLastUpdated] = useState<Date | null>(null);
  const [symphonies, setSymphonies] = useState<SymphonyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const baseHoldingsRef = useRef<HoldingsResponse | null>(null);
  const basePerformanceRef = useRef<PerformancePoint[]>([]);
  const baseSummaryRef = useRef<Summary | null>(null);

  const fetchData = useCallback(async () => {
    if (!resolvedAccountId) return;

    const range = resolveDashboardRange(period, customStart, customEnd);

    try {
      setError(null);
      const [nextSummary, nextHoldings] = await Promise.all([
        api.getSummary(
          resolvedAccountId,
          range.period,
          range.startDate,
          range.endDate,
        ),
        api.getHoldings(resolvedAccountId),
      ]);

      setSummary(nextSummary);
      baseSummaryRef.current = nextSummary;
      setHoldings(nextHoldings);
      setHoldingsLastUpdated(new Date());
      baseHoldingsRef.current = nextHoldings;

      try {
        const nextPerformance = await api.getPerformance(
          resolvedAccountId,
          range.period,
          range.startDate,
          range.endDate,
        );
        setPerformance(nextPerformance);
        basePerformanceRef.current = nextPerformance;
      } catch {
        setPerformance([]);
        basePerformanceRef.current = [];
      }

      try {
        const nextSymphonies = await api.getSymphonies(resolvedAccountId);
        setSymphonies(nextSymphonies);
      } catch {
        setSymphonies([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [resolvedAccountId, period, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForAccountChange = useCallback(() => {
    setSummary(null);
    setPerformance([]);
    setHoldings(null);
    setSymphonies([]);
    setError(null);
    setLoading(true);
  }, []);

  const restoreBaseData = useCallback(() => {
    if (baseSummaryRef.current) {
      setSummary(baseSummaryRef.current);
    }
    if (baseHoldingsRef.current) {
      setHoldings(baseHoldingsRef.current);
    }
    if (basePerformanceRef.current.length > 0) {
      setPerformance(basePerformanceRef.current);
    }
  }, []);

  return {
    summary,
    performance,
    holdings,
    holdingsLastUpdated,
    symphonies,
    loading,
    error,
    setSummary,
    setPerformance,
    setHoldings,
    setHoldingsLastUpdated,
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
