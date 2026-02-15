import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, SymphonyCatalogItem } from "@/lib/api";

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
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [symphonyCatalog, setSymphonyCatalog] = useState<SymphonyCatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCustomInput || catalogLoaded) return;
    api
      .getSymphonyCatalog()
      .then((items) => {
        setSymphonyCatalog(items);
        setCatalogLoaded(true);
      })
      .catch(() => setCatalogLoaded(true));
  }, [showCustomInput, catalogLoaded]);

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
    setShowCustomInput(true);
  }, []);

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
    if (!raw || benchmarksCount >= maxBenchmarks) return;

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
      onBenchmarkAdd?.(`symphony:${symphonyId}`);
      setCustomTickerInput("");
      setShowCustomInput(false);
      setCatalogDropdownOpen(false);
    },
    [onBenchmarkAdd],
  );

  const refreshCatalog = useCallback(() => {
    setCatalogLoaded(false);
    api
      .getSymphonyCatalog(true)
      .then((items) => {
        setSymphonyCatalog(items);
        setCatalogLoaded(true);
      })
      .catch(() => setCatalogLoaded(true));
  }, []);

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
