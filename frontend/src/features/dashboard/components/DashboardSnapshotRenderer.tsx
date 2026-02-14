import type { RefObject } from "react";

import { DEFAULT_METRICS, SnapshotView } from "@/components/SnapshotView";
import type { ScreenshotConfig } from "@/lib/api";
import type { DashboardSnapshotData } from "@/features/dashboard/types";

type Props = {
  snapshotRef: RefObject<HTMLDivElement | null>;
  snapshotVisible: boolean;
  snapshotData: DashboardSnapshotData | null;
  screenshotConfig: ScreenshotConfig | null;
  todayDollarChange?: number;
  todayPctChange?: number;
};

export function DashboardSnapshotRenderer({
  snapshotRef,
  snapshotVisible,
  snapshotData,
  screenshotConfig,
  todayDollarChange,
  todayPctChange,
}: Props) {
  if (!snapshotVisible || !snapshotData || !screenshotConfig) return null;

  return (
    <div style={{ position: "fixed", left: "-9999px", top: 0, zIndex: -1 }}>
      <SnapshotView
        ref={snapshotRef}
        data={snapshotData.perf}
        summary={snapshotData.sum}
        chartMode={
          (screenshotConfig.chart_mode || "twr") as
            | "portfolio"
            | "twr"
            | "mwr"
            | "drawdown"
        }
        selectedMetrics={
          screenshotConfig.metrics?.length
            ? screenshotConfig.metrics
            : DEFAULT_METRICS
        }
        hidePortfolioValue={screenshotConfig.hide_portfolio_value ?? false}
        todayDollarChange={todayDollarChange}
        todayPctChange={todayPctChange}
        periodReturns={snapshotData.periodReturns}
        benchmarks={snapshotData.benchmarks}
      />
    </div>
  );
}
