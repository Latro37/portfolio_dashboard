import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { showToast } from "@/components/Toast";
import {
  MAX_BENCHMARKS,
  pickBenchmarkColor,
} from "@/features/charting/benchmarkConfig";
import { BenchmarkEntry, SymphonyCatalogItem } from "@/lib/api";
import {
  getBenchmarkHistoryQueryFn,
  getSymphonyBenchmarkQueryFn,
  getSymphonyCatalogQueryFn,
  queryRetryOverrides,
} from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

function clampLabel(value: string): string {
  return value.length > 21 ? `${value.slice(0, 19)}...` : value;
}

type Result = {
  benchmarks: BenchmarkEntry[];
  customInputVisible: boolean;
  customTickerInput: string;
  catalogLoaded: boolean;
  catalogDropdownOpen: boolean;
  catalogMatches: SymphonyCatalogItem[];
  benchmarkDropdownRef: RefObject<HTMLDivElement | null>;
  maxBenchmarks: number;
  setCustomInputVisible: (next: boolean) => void;
  setCustomTickerInput: (next: string) => void;
  setCatalogDropdownOpen: (next: boolean) => void;
  refreshSymphonyCatalog: () => Promise<void>;
  addBenchmark: (ticker: string) => void;
  removeBenchmark: (ticker: string) => void;
};

export function useSymphonyBenchmarkManager(accountId: string): Result {
  const queryClient = useQueryClient();
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);
  const [customInputVisible, setCustomInputVisible] = useState(false);
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const benchmarkDropdownRef = useRef<HTMLDivElement>(null);
  const maxBenchmarks = MAX_BENCHMARKS;
  const catalogQuery = useQuery({
    queryKey: queryKeys.symphonyCatalog(false),
    queryFn: () => getSymphonyCatalogQueryFn(false),
    enabled: customInputVisible,
    staleTime: 900000,
  });
  const symphonyCatalog = useMemo(
    () => catalogQuery.data ?? [],
    [catalogQuery.data],
  );
  const catalogLoaded = !customInputVisible || catalogQuery.status !== "pending";

  useEffect(() => {
    if (!catalogDropdownOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        benchmarkDropdownRef.current &&
        !benchmarkDropdownRef.current.contains(event.target as Node)
      ) {
        setCatalogDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catalogDropdownOpen]);

  const catalogMatches = useMemo(() => {
    const query = customTickerInput.trim().toLowerCase();
    if (!query || query.length < 2) return [];
    return symphonyCatalog
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [customTickerInput, symphonyCatalog]);

  const addBenchmark = useCallback(
    (ticker: string) => {
      if (benchmarks.some((entry) => entry.ticker === ticker)) return;
      if (benchmarks.length >= maxBenchmarks) {
        showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
        return;
      }

      const color = pickBenchmarkColor(benchmarks.map((entry) => entry.color));

      const placeholder: BenchmarkEntry = {
        ticker,
        label: ticker,
        data: [],
        color,
      };
      setBenchmarks((previous) => [...previous, placeholder]);

      if (ticker.startsWith("symphony:")) {
        const symphonyId = ticker.slice(9);
        void queryClient
          .fetchQuery({
            queryKey: queryKeys.symphonyBenchmark({ symphonyId, accountId }),
            queryFn: () => getSymphonyBenchmarkQueryFn(symphonyId),
            staleTime: 900000,
            ...queryRetryOverrides.symphonyBenchmark,
          })
          .then((response) => {
            const label = clampLabel(response.name || symphonyId);
            setBenchmarks((previous) =>
              previous.map((entry) =>
                entry.ticker === ticker
                  ? { ...entry, label, data: response.data }
                  : entry,
              ),
            );
          })
          .catch(() =>
            setBenchmarks((previous) =>
              previous.filter((entry) => entry.ticker !== ticker),
            ),
          );
        return;
      }

      void queryClient
        .fetchQuery({
          queryKey: queryKeys.benchmarkHistory({
            ticker,
            accountId,
          }),
          queryFn: () =>
            getBenchmarkHistoryQueryFn({
              ticker,
              accountId,
            }),
          staleTime: 900000,
        })
        .then((response) =>
          setBenchmarks((previous) =>
            previous.map((entry) =>
              entry.ticker === ticker ? { ...entry, data: response.data } : entry,
            ),
          ),
        )
        .catch(() =>
          setBenchmarks((previous) =>
            previous.filter((entry) => entry.ticker !== ticker),
          ),
        );
    },
    [benchmarks, accountId, maxBenchmarks, queryClient],
  );

  const removeBenchmark = useCallback((ticker: string) => {
    setBenchmarks((previous) => previous.filter((entry) => entry.ticker !== ticker));
  }, []);

  const refreshSymphonyCatalog = useCallback(async () => {
    const items = await queryClient.fetchQuery({
      queryKey: queryKeys.symphonyCatalog(true),
      queryFn: () => getSymphonyCatalogQueryFn(true),
      staleTime: 900000,
    });
    queryClient.setQueryData(queryKeys.symphonyCatalog(false), items);
  }, [queryClient]);

  return {
    benchmarks,
    customInputVisible,
    customTickerInput,
    catalogLoaded,
    catalogDropdownOpen,
    catalogMatches,
    benchmarkDropdownRef,
    maxBenchmarks,
    setCustomInputVisible,
    setCustomTickerInput,
    setCatalogDropdownOpen,
    refreshSymphonyCatalog,
    addBenchmark,
    removeBenchmark,
  };
}
