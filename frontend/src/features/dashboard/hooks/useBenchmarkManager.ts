import { useCallback, useState } from "react";

import { api, BenchmarkEntry } from "@/lib/api";

const BENCH_COLORS = ["#f97316", "#e4e4e7", "#ec4899"] as const;

function clampLabel(value: string): string {
  return value.length > 21 ? `${value.slice(0, 19)}...` : value;
}

export function useBenchmarkManager(resolvedAccountId?: string) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);

  const handleBenchmarkAdd = useCallback(
    (ticker: string) => {
      if (benchmarks.length >= 3 || benchmarks.some((b) => b.ticker === ticker)) return;
      const color = BENCH_COLORS.find((c) => !benchmarks.some((b) => b.color === c)) || BENCH_COLORS[0];
      const placeholder: BenchmarkEntry = { ticker, label: ticker, data: [], color };
      setBenchmarks((prev) => [...prev, placeholder]);

      if (ticker.startsWith("symphony:")) {
        const symId = ticker.slice(9);
        api
          .getSymphonyBenchmark(symId)
          .then((res) => {
            const label = clampLabel(res.name || symId);
            setBenchmarks((prev) =>
              prev.map((b) => (b.ticker === ticker ? { ...b, label, data: res.data } : b)),
            );
          })
          .catch(() => setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker)));
      } else {
        api
          .getBenchmarkHistory(ticker, undefined, undefined, resolvedAccountId)
          .then((res) =>
            setBenchmarks((prev) => prev.map((b) => (b.ticker === ticker ? { ...b, data: res.data } : b))),
          )
          .catch(() => setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker)));
      }
    },
    [benchmarks, resolvedAccountId],
  );

  const handleBenchmarkRemove = useCallback((ticker: string) => {
    setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker));
  }, []);

  return {
    benchmarks,
    handleBenchmarkAdd,
    handleBenchmarkRemove,
  };
}
