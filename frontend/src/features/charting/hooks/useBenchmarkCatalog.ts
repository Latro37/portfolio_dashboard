import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { showToast } from "@/components/Toast";
import { SymphonyCatalogItem } from "@/lib/api";
import { getSymphonyCatalogQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

type Args = {
  onBenchmarkAdd?: (ticker: string) => void;
  benchmarksCount: number;
  maxBenchmarks: number;
};

type Result = {
  customTickerInput: string;
  showCustomInput: boolean;
  catalogDropdownOpen: boolean;
  catalogMatches: SymphonyCatalogItem[];
  dropdownRef: RefObject<HTMLDivElement | null>;
  openCustomInput: () => void;
  handleInputChange: (value: string) => void;
  handleInputFocus: () => void;
  handleInputBlur: () => void;
  submitCustomBenchmark: () => void;
  selectCatalogItem: (symphonyId: string) => void;
  refreshCatalog: () => void;
};

export function useBenchmarkCatalog({
  onBenchmarkAdd,
  benchmarksCount,
  maxBenchmarks,
}: Args): Result {
  const queryClient = useQueryClient();
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const catalogQuery = useQuery({
    queryKey: queryKeys.symphonyCatalog(false),
    queryFn: () => getSymphonyCatalogQueryFn(false),
    enabled: showCustomInput,
    staleTime: 900000,
  });
  const symphonyCatalog = useMemo(
    () => catalogQuery.data ?? [],
    [catalogQuery.data],
  );

  useEffect(() => {
    if (!catalogDropdownOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
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

  const openCustomInput = useCallback(() => {
    if (benchmarksCount >= maxBenchmarks) {
      showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
      return;
    }
    setShowCustomInput(true);
  }, [benchmarksCount, maxBenchmarks]);

  const handleInputChange = useCallback((value: string) => {
    setCustomTickerInput(value);
    setCatalogDropdownOpen(true);
  }, []);

  const handleInputFocus = useCallback(() => {
    setCatalogDropdownOpen(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      if (!customTickerInput.trim()) {
        setShowCustomInput(false);
        setCatalogDropdownOpen(false);
      }
    }, 200);
  }, [customTickerInput]);

  const submitCustomBenchmark = useCallback(() => {
    const raw = customTickerInput.trim();
    if (!raw) return;
    if (benchmarksCount >= maxBenchmarks) {
      showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
      return;
    }

    const symphonyMatch = raw.match(/composer\.trade\/symphony\/([^/\s?]+)/);
    if (symphonyMatch) {
      onBenchmarkAdd?.(`symphony:${symphonyMatch[1]}`);
    } else {
      onBenchmarkAdd?.(raw.toUpperCase());
    }

    setCustomTickerInput("");
    setShowCustomInput(false);
    setCatalogDropdownOpen(false);
  }, [customTickerInput, benchmarksCount, maxBenchmarks, onBenchmarkAdd]);

  const selectCatalogItem = useCallback(
    (symphonyId: string) => {
      if (benchmarksCount >= maxBenchmarks) {
        showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
        return;
      }
      onBenchmarkAdd?.(`symphony:${symphonyId}`);
      setCustomTickerInput("");
      setShowCustomInput(false);
      setCatalogDropdownOpen(false);
    },
    [benchmarksCount, maxBenchmarks, onBenchmarkAdd],
  );

  const refreshCatalog = useCallback(() => {
    void queryClient
      .fetchQuery({
        queryKey: queryKeys.symphonyCatalog(true),
        queryFn: () => getSymphonyCatalogQueryFn(true),
        staleTime: 900000,
      })
      .then((items) => {
        queryClient.setQueryData(queryKeys.symphonyCatalog(false), items);
      });
  }, [queryClient]);

  return {
    customTickerInput,
    showCustomInput,
    catalogDropdownOpen,
    catalogMatches,
    dropdownRef,
    openCustomInput,
    handleInputChange,
    handleInputFocus,
    handleInputBlur,
    submitCustomBenchmark,
    selectCatalogItem,
    refreshCatalog,
  };
}
