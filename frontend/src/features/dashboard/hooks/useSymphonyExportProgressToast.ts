import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { upsertToast } from "@/components/Toast";
import { getSymphonyExportJobStatusQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

const TOAST_ID = "symphony-export-progress";

function formatProgress(exported: number, total: number | null) {
  return typeof total === "number" && total > 0 ? `${exported}/${total}` : String(exported);
}

export function useSymphonyExportProgressToast() {
  const prevStatusRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.symphonyExportJobStatus(),
    queryFn: getSymphonyExportJobStatusQueryFn,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1000 : false,
  });

  useEffect(() => {
    const status = statusQuery.data?.status;
    if (!status) return;

    const exported = statusQuery.data?.exported ?? 0;
    const total = statusQuery.data?.total ?? null;
    const prev = prevStatusRef.current;

    if (status === "running") {
      upsertToast({
        id: TOAST_ID,
        type: "info",
        persistent: true,
        text: `Extracting Symphonies to local storage. Symphonies extracted: ${formatProgress(exported, total)}`,
      });
    } else if (prev === "running" && status === "complete") {
      upsertToast({
        id: TOAST_ID,
        type: "success",
        persistent: false,
        autoDismissMs: 1500,
        text: `Symphony extraction complete. Symphonies extracted: ${exported}`,
      });
    } else if (prev === "running" && status === "error") {
      const error = statusQuery.data?.error ? `: ${statusQuery.data.error}` : "";
      upsertToast({
        id: TOAST_ID,
        type: "error",
        persistent: false,
        autoDismissMs: 5000,
        text: `Symphony extraction failed${error}`,
      });
    }

    prevStatusRef.current = status;
  }, [
    statusQuery.data?.status,
    statusQuery.data?.exported,
    statusQuery.data?.total,
    statusQuery.data?.error,
  ]);
}

