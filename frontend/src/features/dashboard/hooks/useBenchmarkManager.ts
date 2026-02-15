import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { showToast } from "@/components/Toast";
import {
  MAX_BENCHMARKS,
  pickBenchmarkColor,
} from "@/features/charting/benchmarkConfig";
import { BenchmarkEntry } from "@/lib/api";
import {
  getBenchmarkHistoryQueryFn,
  getSymphonyBenchmarkQueryFn,
  queryRetryOverrides,
} from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

function clampLabel(value: string): string {
  return value.length > 21 ? `${value.slice(0, 19)}...` : value;
}

export function useBenchmarkManager(resolvedAccountId?: string) {
  const queryClient = useQueryClient();
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);

  const handleBenchmarkAdd = useCallback(
    (ticker: string) => {
      if (benchmarks.some((b) => b.ticker === ticker)) return;
      if (benchmarks.length >= MAX_BENCHMARKS) {
        showToast(`You can add up to ${MAX_BENCHMARKS} benchmarks.`, "error");
        return;
      }
      const color = pickBenchmarkColor(benchmarks.map((entry) => entry.color));
      const placeholder: BenchmarkEntry = { ticker, label: ticker, data: [], color };
      setBenchmarks((previous) => [...previous, placeholder]);

      if (ticker.startsWith("symphony:")) {
        const symphonyId = ticker.slice(9);
        void queryClient
          .fetchQuery({
            queryKey: queryKeys.symphonyBenchmark({
              symphonyId,
              accountId: resolvedAccountId ?? "",
            }),
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
            accountId: resolvedAccountId,
          }),
          queryFn: () =>
            getBenchmarkHistoryQueryFn({
              ticker,
              accountId: resolvedAccountId,
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
    [benchmarks, queryClient, resolvedAccountId],
  );

  const handleBenchmarkRemove = useCallback((ticker: string) => {
    setBenchmarks((previous) =>
      previous.filter((entry) => entry.ticker !== ticker),
    );
  }, []);

  return {
    benchmarks,
    handleBenchmarkAdd,
    handleBenchmarkRemove,
  };
}
