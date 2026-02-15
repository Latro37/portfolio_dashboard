import type { ChartMode } from "@/features/charting/types";

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;

type Props = {
  mode: ChartMode;
  setMode: (mode: ChartMode) => void;
  portfolioLabel?: string;
  hideMWR?: boolean;
  hidePeriodControls?: boolean;
  period: string;
  isCustomRange: boolean;
  displayStart: string;
  displayEnd: string;
  onPeriodChange: (period: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

export function PerformanceChartControlsRow({
  mode,
  setMode,
  portfolioLabel,
  hideMWR,
  hidePeriodControls,
  period,
  isCustomRange,
  displayStart,
  displayEnd,
  onPeriodChange,
  onStartDateChange,
  onEndDateChange,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg bg-muted p-0.5">
        <button
          onClick={() => setMode("portfolio")}
          className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "portfolio"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {portfolioLabel || "Portfolio Value"}
        </button>
        <button
          onClick={() => setMode("twr")}
          className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "twr"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          TWR
        </button>
        {!hideMWR && (
          <button
            onClick={() => setMode("mwr")}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "mwr"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            MWR
          </button>
        )}
        <button
          onClick={() => setMode("drawdown")}
          className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "drawdown"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Drawdown
        </button>
      </div>

      {!hidePeriodControls && (
        <>
          <div className="h-5 w-px bg-border/50" />

          <div className="flex rounded-lg bg-muted p-0.5">
            {PERIODS.map((periodValue) => (
              <button
                key={periodValue}
                data-testid={`period-${periodValue}`}
                onClick={() => {
                  onPeriodChange(periodValue);
                  onStartDateChange("");
                  onEndDateChange("");
                }}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === periodValue && !isCustomRange
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {periodValue}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border/50" />

          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={displayStart}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={displayEnd}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
            />
            {isCustomRange && (
              <button
                onClick={() => {
                  onStartDateChange("");
                  onEndDateChange("");
                }}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
