import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { upsertToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { getSymphonyExportJobStatusQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

const TOAST_ID = "symphony-export-progress";

function formatProgress(exported: number, total: number | null) {
  return typeof total === "number" && total > 0 ? `${exported}/${total}` : String(exported);
}

export function useSymphonyExportProgressToast() {
  const prevStatusRef = useRef<string | null>(null);
  const suppressedJobIdRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.symphonyExportJobStatus(),
    queryFn: getSymphonyExportJobStatusQueryFn,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === "running" || query.state.data?.status === "cancelling"
        ? 1000
        : false,
  });

  useEffect(() => {
    const status = statusQuery.data?.status;
    if (!status) return;

    const jobId = statusQuery.data?.job_id ?? null;
    const exported = statusQuery.data?.exported ?? 0;
    const total = statusQuery.data?.total ?? null;
    const prev = prevStatusRef.current;
    const isSuppressedJob = Boolean(jobId) && suppressedJobIdRef.current === jobId;

    if (jobId && suppressedJobIdRef.current && suppressedJobIdRef.current !== jobId) {
      suppressedJobIdRef.current = null;
    }

    if ((status === "running" || status === "cancelling") && !isSuppressedJob) {
      upsertToast({
        id: TOAST_ID,
        type: "info",
        persistent: true,
        text: `Saving Symphonies locally: ${formatProgress(exported, total)}`,
        onManualDismiss: async () => {
          if (jobId) {
            suppressedJobIdRef.current = jobId;
          }
          try {
            await api.cancelSymphonyExportJob();
          } catch {
            // noop: status polling will reconcile.
          }
        },
      });
    } else if ((prev === "running" || prev === "cancelling") && status === "complete" && !isSuppressedJob) {
      upsertToast({
        id: TOAST_ID,
        type: "success",
        persistent: false,
        autoDismissMs: 1500,
        text: `Symphony extraction complete. Symphonies extracted: ${exported}`,
      });
    } else if ((prev === "running" || prev === "cancelling") && status === "error" && !isSuppressedJob) {
      const error = statusQuery.data?.error ? `: ${statusQuery.data.error}` : "";
      upsertToast({
        id: TOAST_ID,
        type: "error",
        persistent: false,
        autoDismissMs: 5000,
        text: `Symphony extraction failed${error}`,
      });
    } else if ((prev === "running" || prev === "cancelling") && status === "cancelled" && !isSuppressedJob) {
      upsertToast({
        id: TOAST_ID,
        type: "info",
        persistent: false,
        autoDismissMs: 1500,
        text: "Symphony extraction cancelled.",
      });
    }

    prevStatusRef.current = status;
  }, [
    statusQuery.data?.status,
    statusQuery.data?.exported,
    statusQuery.data?.total,
    statusQuery.data?.error,
    statusQuery.data?.job_id,
  ]);
}

