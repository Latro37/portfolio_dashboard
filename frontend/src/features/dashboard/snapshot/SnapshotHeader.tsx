import type { Summary } from "@/lib/api";
import type { SnapshotChartMode } from "@/features/dashboard/snapshot/types";
import {
  formatSnapshotDollar,
  formatSnapshotPct,
  snapshotPctColor,
} from "@/features/dashboard/snapshot/metricCards";

type Props = {
  chartMode: SnapshotChartMode;
  todayStr: string;
  hidePortfolioValue: boolean;
  hasTodayMetric: boolean;
  dayPct: number;
  dayDollar: number;
  summary: Summary;
  hasData: boolean;
  startDate?: string;
  endDate?: string;
};

function chartModeTitle(chartMode: SnapshotChartMode) {
  if (chartMode === "portfolio") return "Portfolio Value vs. Net Deposits";
  if (chartMode === "twr") return "Time-Weighted Return";
  if (chartMode === "mwr") return "Money-Weighted Return";
  return "Drawdown";
}

function formatRangeDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SnapshotHeader({
  chartMode,
  todayStr,
  hidePortfolioValue,
  hasTodayMetric,
  dayPct,
  dayDollar,
  summary,
  hasData,
  startDate,
  endDate,
}: Props) {
  return (
    <div style={{ position: "relative", marginBottom: hidePortfolioValue ? 16 : 8 }}>
      <div>
        <div
          style={{
            fontSize: 14,
            color: "#71717a",
            marginBottom: 4,
          }}
        >
          Portfolio Snapshot &middot; {todayStr}
        </div>
        {!hidePortfolioValue && (
          <>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>
              $
              {summary.portfolio_value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            {!hasTodayMetric && (
              <div
                style={{
                  fontSize: 14,
                  color: snapshotPctColor(dayPct),
                  marginTop: 2,
                }}
              >
                Today: {formatSnapshotDollar(dayDollar)} ({formatSnapshotPct(dayPct)})
              </div>
            )}
          </>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: hidePortfolioValue ? 0 : 4,
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 14, color: "#e4e4e7", fontWeight: 500 }}>
          {chartModeTitle(chartMode)}
        </div>
        {hasData && startDate && endDate && (
          <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
            {formatRangeDate(startDate)} - {formatRangeDate(endDate)}
          </div>
        )}
      </div>
    </div>
  );
}
