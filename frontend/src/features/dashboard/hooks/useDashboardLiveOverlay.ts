import { useCallback } from "react";

import type { PerformancePoint } from "@/lib/api";

export function useDashboardLiveOverlay() {
  const applyLivePoint = useCallback(
    (base: PerformancePoint[], todayPoint: PerformancePoint): PerformancePoint[] => {
      if (!base.length) return [todayPoint];
      const next = [...base];
      const last = next[next.length - 1];
      if (last.date === todayPoint.date) {
        next[next.length - 1] = todayPoint;
        return next;
      }
      next.push(todayPoint);
      return next;
    },
    [],
  );

  return { applyLivePoint };
}
