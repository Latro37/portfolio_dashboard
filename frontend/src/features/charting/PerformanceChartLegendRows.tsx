import type { ChartMode } from "@/features/charting/types";

type Props = {
  mode: ChartMode;
  hasData: boolean;
  showOverlay: boolean;
  overlayColor: string;
  overlayLabel?: string;
  overlayAvailable: boolean;
  onOverlayToggle?: (value: boolean) => void;
  showPortfolio: boolean;
  showDeposits: boolean;
  onTogglePortfolio: () => void;
  onToggleDeposits: () => void;
};

export function PerformanceChartLegendRows({
  mode,
  hasData,
  showOverlay,
  overlayColor,
  overlayLabel,
  overlayAvailable,
  onOverlayToggle,
  showPortfolio,
  showDeposits,
  onTogglePortfolio,
  onToggleDeposits,
}: Props) {
  return (
    <>
      {(mode === "twr" || mode === "drawdown") &&
        hasData &&
        onOverlayToggle &&
        overlayAvailable && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium cursor-default ${
                mode === "drawdown" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: mode === "drawdown" ? "#ef4444" : "#10b981",
                }}
              />
              Live
            </button>
            <button
              onClick={() => onOverlayToggle(!showOverlay)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showOverlay
                  ? "text-indigo-400"
                  : "text-muted-foreground/40 line-through"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: showOverlay ? overlayColor : "#71717a" }}
              />
              {overlayLabel || "Overlay"}
            </button>
          </div>
        )}

      {mode === "portfolio" && hasData && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            onClick={onTogglePortfolio}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              showPortfolio ? "text-emerald-400" : "text-muted-foreground/40 line-through"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: showPortfolio ? "#10b981" : "#71717a" }}
            />
            Portfolio
          </button>
          <button
            onClick={onToggleDeposits}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
              showDeposits ? "text-indigo-400" : "text-muted-foreground/40 line-through"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: showDeposits ? "#6366f1" : "#71717a" }}
            />
            Deposits
          </button>
        </div>
      )}
    </>
  );
}
