import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";

import { showToast } from "@/components/Toast";
import { api, ScreenshotConfig, Summary } from "@/lib/api";
import { invalidateAfterSync } from "@/lib/queryInvalidation";
import { isAfterClose, todayET } from "@/lib/marketHours";
import {
  BENCHMARK_COLORS,
  MAX_BENCHMARKS,
} from "@/features/charting/benchmarkConfig";
import type {
  DashboardPeriodReturns,
  DashboardSnapshotData,
} from "@/features/dashboard/types";

type Args = {
  resolvedAccountId?: string;
  screenshotConfig: ScreenshotConfig | null;
  setScreenshotConfig: Dispatch<SetStateAction<ScreenshotConfig | null>>;
  refreshDashboardData: () => Promise<void>;
};

type Result = {
  snapshotRef: RefObject<HTMLDivElement | null>;
  snapshotVisible: boolean;
  snapshotData: DashboardSnapshotData | null;
  triggerSnapshot: (autoMode?: boolean) => Promise<void>;
  runSyncAndRefresh: () => Promise<void>;
};

export function usePostCloseSyncAndSnapshot({
  resolvedAccountId,
  screenshotConfig,
  setScreenshotConfig,
  refreshDashboardData,
}: Args): Result {
  const queryClient = useQueryClient();
  const snapshotRef = useRef<HTMLDivElement>(null);
  const postCloseRunInFlightRef = useRef(false);
  const lastPostCloseErrorKeyRef = useRef<string | null>(null);
  const [snapshotVisible, setSnapshotVisible] = useState(false);
  const [snapshotData, setSnapshotData] = useState<DashboardSnapshotData | null>(null);
  const syncMutation = useMutation({
    mutationFn: () => api.triggerSync(resolvedAccountId),
    onSuccess: async () => {
      await invalidateAfterSync(queryClient, resolvedAccountId);
      await refreshDashboardData();
    },
  });

  const triggerSnapshot = useCallback(
    async (autoMode = false): Promise<void> => {
      let activeConfig = screenshotConfig;
      try {
        const appConfig = await api.getConfig();
        if (appConfig.screenshot) {
          activeConfig = appConfig.screenshot;
          setScreenshotConfig(activeConfig);
        }
      } catch {
        // Keep cached config.
      }

      if (!activeConfig) {
        if (!autoMode) showToast("Configure screenshot settings first", "error");
        return;
      }
      if (autoMode && !activeConfig.enabled) return;
      if (!activeConfig.local_path) {
        if (!autoMode) showToast("Set a screenshot save folder in Settings", "error");
        return;
      }

      const snapshotAccountId = activeConfig.account_id || resolvedAccountId;
      const snapshotPeriod =
        activeConfig.period === "custom" ? undefined : activeConfig.period;
      const snapshotStart =
        activeConfig.period === "custom" ? activeConfig.custom_start : undefined;

      try {
        const needsPeriodReturns = activeConfig.metrics?.some((metric) =>
          ["return_1w", "return_1m", "return_ytd"].includes(metric),
        );

        const [snapshotSummary, snapshotPerformance, ...periodSummaries] =
          await Promise.all([
            api.getSummary(
              snapshotAccountId,
              snapshotPeriod,
              snapshotStart,
              undefined,
            ),
            api.getPerformance(
              snapshotAccountId,
              snapshotPeriod,
              snapshotStart,
              undefined,
            ),
            ...(needsPeriodReturns
              ? [
                  api.getSummary(snapshotAccountId, "1W").catch(() => null),
                  api.getSummary(snapshotAccountId, "1M").catch(() => null),
                  api.getSummary(snapshotAccountId, "YTD").catch(() => null),
                ]
              : []),
          ]);

        const periodReturns: DashboardPeriodReturns = {};
        if (needsPeriodReturns) {
          if (periodSummaries[0]) {
            periodReturns["1W"] = (periodSummaries[0] as Summary).time_weighted_return;
          }
          if (periodSummaries[1]) {
            periodReturns["1M"] = (periodSummaries[1] as Summary).time_weighted_return;
          }
          if (periodSummaries[2]) {
            periodReturns.YTD = (periodSummaries[2] as Summary).time_weighted_return;
          }
        }

        const benchmarkTickers = (activeConfig.benchmarks || []).slice(0, MAX_BENCHMARKS);
        const snapshotBenchmarks: NonNullable<DashboardSnapshotData["benchmarks"]> = [];
        if (benchmarkTickers.length > 0 && activeConfig.chart_mode !== "portfolio") {
          const benchmarkResults = await Promise.all(
            benchmarkTickers.map((ticker) =>
              api
                .getBenchmarkHistory(
                  ticker,
                  undefined,
                  undefined,
                  snapshotAccountId,
                )
                .catch(() => null),
            ),
          );

          benchmarkResults.forEach((result, index) => {
            if (result && result.data.length > 0) {
              snapshotBenchmarks.push({
                ticker: benchmarkTickers[index],
                data: result.data,
                color:
                  BENCHMARK_COLORS[index % BENCHMARK_COLORS.length],
              });
            }
          });
        }

        setSnapshotData({
          perf: snapshotPerformance,
          sum: snapshotSummary,
          periodReturns,
          benchmarks: snapshotBenchmarks,
        });
        setSnapshotVisible(true);

        let attempts = 0;
        while (!snapshotRef.current && attempts < 30) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts += 1;
        }

        if (!snapshotRef.current) {
          throw new Error("SnapshotView did not mount in time");
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const dataUrl = await toPng(snapshotRef.current, {
          width: 1200,
          height: 900,
          pixelRatio: 2,
          backgroundColor: "#09090b",
        });
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const dateStr = todayET();
        await api.uploadScreenshot(blob, dateStr);
        showToast("Screenshot saved");
      } catch (error) {
        if (!autoMode) {
          console.error("Screenshot capture failed:", error);
          showToast("Screenshot failed", "error");
        }
        if (autoMode) throw error;
      } finally {
        setSnapshotVisible(false);
        setSnapshotData(null);
      }
    },
    [resolvedAccountId, screenshotConfig, setScreenshotConfig],
  );

  const runSyncAndRefresh = useCallback(async () => {
    await syncMutation.mutateAsync();
  }, [syncMutation]);

  useEffect(() => {
    if (!resolvedAccountId) return;

    const doPostCloseUpdate = async () => {
      if (postCloseRunInFlightRef.current) return;
      if (!isAfterClose()) return;
      const today = todayET();
      const lastCloseUpdate = localStorage.getItem("last_post_close_update");
      if (lastCloseUpdate === today) return;

      postCloseRunInFlightRef.current = true;
      try {
        await runSyncAndRefresh();
        await triggerSnapshot(true);
        localStorage.setItem("last_post_close_update", today);
        lastPostCloseErrorKeyRef.current = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const errorKey = `${today}:${message}`;
        if (lastPostCloseErrorKeyRef.current !== errorKey) {
          if (error instanceof TypeError && /failed to fetch/i.test(message)) {
            console.warn(`Post-close update network call failed, will retry: ${message}`);
          } else {
            console.error("Post-close update failed, will retry:", error);
          }
          lastPostCloseErrorKeyRef.current = errorKey;
        }
      } finally {
        postCloseRunInFlightRef.current = false;
      }
    };

    doPostCloseUpdate();
    const intervalId = setInterval(doPostCloseUpdate, 60_000);
    return () => clearInterval(intervalId);
  }, [resolvedAccountId, runSyncAndRefresh, triggerSnapshot]);

  return {
    snapshotRef,
    snapshotVisible,
    snapshotData,
    triggerSnapshot,
    runSyncAndRefresh,
  };
}
