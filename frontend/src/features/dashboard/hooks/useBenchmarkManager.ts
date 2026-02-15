import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { BenchmarkEntry } from "@/lib/api";
import {
  getBenchmarkHistoryQueryFn,
  getSymphonyBenchmarkQueryFn,
  queryRetryOverrides,
} from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

const BENCH_COLORS = ["#f97316", "#e4e4e7", "#ec4899"] as const;

function clampLabel(value: string): string {
  return value.length > 21 ? `${value.slice(0, 19)}...` : value;
}

export function useBenchmarkManager(resolvedAccountId?: string) {
  const queryClient = useQueryClient();
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);

  const handleBenchmarkAdd = useCallback(
    (ticker: string) => {
      if (benchmarks.length >= 3 || benchmarks.some((b) => b.ticker === ticker)) return;
      const color =
        BENCH_COLORS.find((candidate) => !benchmarks.some((b) => b.color === candidate)) ||
        BENCH_COLORS[0];
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
