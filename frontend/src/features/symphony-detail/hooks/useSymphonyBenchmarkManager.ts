import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  api,
  BenchmarkEntry,
  SymphonyCatalogItem,
} from "@/lib/api";

const BENCHMARK_COLORS = ["#f97316", "#e4e4e7", "#ec4899"] as const;

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
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);
  const [customInputVisible, setCustomInputVisible] = useState(false);
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [symphonyCatalog, setSymphonyCatalog] = useState<SymphonyCatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const benchmarkDropdownRef = useRef<HTMLDivElement>(null);
  const maxBenchmarks = 3;

  const fetchCatalog = useCallback(async (refresh = false) => {
    try {
      const items = await api.getSymphonyCatalog(refresh);
      setSymphonyCatalog(items);
    } finally {
      setCatalogLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (customInputVisible && !catalogLoaded) {
      fetchCatalog().catch(() => undefined);
    }
  }, [customInputVisible, catalogLoaded, fetchCatalog]);

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
      if (benchmarks.length >= maxBenchmarks) return;
      if (benchmarks.some((entry) => entry.ticker === ticker)) return;

      const color =
        BENCHMARK_COLORS.find(
          (candidate) => !benchmarks.some((entry) => entry.color === candidate),
        ) || BENCHMARK_COLORS[0];

      const placeholder: BenchmarkEntry = {
        ticker,
        label: ticker,
        data: [],
        color,
      };
      setBenchmarks((prev) => [...prev, placeholder]);

      if (ticker.startsWith("symphony:")) {
        const symphonyId = ticker.slice(9);
        api
          .getSymphonyBenchmark(symphonyId)
          .then((response) => {
            const label = clampLabel(response.name || symphonyId);
            setBenchmarks((prev) =>
              prev.map((entry) =>
                entry.ticker === ticker
                  ? { ...entry, label, data: response.data }
                  : entry,
              ),
            );
          })
          .catch(() =>
            setBenchmarks((prev) =>
              prev.filter((entry) => entry.ticker !== ticker),
            ),
          );
        return;
      }

      api
        .getBenchmarkHistory(ticker, undefined, undefined, accountId)
        .then((response) =>
          setBenchmarks((prev) =>
            prev.map((entry) =>
              entry.ticker === ticker ? { ...entry, data: response.data } : entry,
            ),
          ),
        )
        .catch(() =>
          setBenchmarks((prev) =>
            prev.filter((entry) => entry.ticker !== ticker),
          ),
        );
    },
    [benchmarks, accountId],
  );

  const removeBenchmark = useCallback((ticker: string) => {
    setBenchmarks((prev) => prev.filter((entry) => entry.ticker !== ticker));
  }, []);

  const refreshSymphonyCatalog = useCallback(async () => {
    setCatalogLoaded(false);
    await fetchCatalog(true);
  }, [fetchCatalog]);

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
