"use client";

import type { ChartMode } from "@/features/charting/types";
import { SymphonyDetailPeriod, SYMPHONY_DETAIL_PERIODS } from "@/features/symphony-detail/types";

type DatePoint = { date: string };

type Props = {
  chartMode: ChartMode;
  period: SymphonyDetailPeriod;
  customStart: string;
  customEnd: string;
  filteredBacktestData: DatePoint[];
  oosDate: string;
  onChartModeChange: (mode: ChartMode) => void;
  onPeriodChange: (period: SymphonyDetailPeriod) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onClearCustomRange: () => void;
};

export function SymphonyBacktestControls({
  chartMode,
  period,
  customStart,
  customEnd,
  filteredBacktestData,
  oosDate,
  onChartModeChange,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
  onClearCustomRange,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg bg-muted p-0.5">
        {(["twr", "drawdown"] as ChartMode[]).map((mode) => {
          const active = chartMode === mode || (mode === "twr" && chartMode !== "drawdown");
          return (
            <button
              key={mode}
              onClick={() => onChartModeChange(mode)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "twr" ? "Return" : "Drawdown"}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-border/50" />

      <div className="flex rounded-lg bg-muted p-0.5">
        {SYMPHONY_DETAIL_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => {
              onPeriodChange(p);
              onClearCustomRange();
            }}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              period === p && !customStart && !customEnd
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
        {oosDate && (
          <button
            onClick={() => {
              onPeriodChange("OOS");
              onClearCustomRange();
            }}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              period === "OOS" && !customStart && !customEnd
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={`Out of Sample - from ${oosDate} (last edited)`}
          >
            OOS
          </button>
        )}
      </div>

      <div className="h-5 w-px bg-border/50" />

      <div className="flex items-center gap-2 text-xs">
        <input
          type="date"
          value={customStart || (filteredBacktestData.length ? filteredBacktestData[0].date : "")}
          onChange={(e) => onCustomStartChange(e.target.value)}
          className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
        />
        <span className="text-muted-foreground">to</span>
        <input
          type="date"
          value={
            customEnd ||
            (filteredBacktestData.length
              ? filteredBacktestData[filteredBacktestData.length - 1].date
              : "")
          }
          onChange={(e) => onCustomEndChange(e.target.value)}
          className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
        />
        {(customStart || customEnd) && (
          <button
            onClick={onClearCustomRange}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
