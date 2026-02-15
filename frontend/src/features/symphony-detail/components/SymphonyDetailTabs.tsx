"use client";

import { RefreshCw } from "lucide-react";

import { SymphonyDetailTab } from "@/features/symphony-detail/types";

type Props = {
  tab: SymphonyDetailTab;
  onTabChange: (tab: SymphonyDetailTab) => void;
  loadingBacktest: boolean;
  onRefreshBacktest: () => void;
};

export function SymphonyDetailTabs({
  tab,
  onTabChange,
  loadingBacktest,
  onRefreshBacktest,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg bg-muted p-0.5 w-fit">
        <button
          onClick={() => onTabChange("live")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "live"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Live Performance
        </button>
        <button
          onClick={() => onTabChange("backtest")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "backtest"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Backtest
        </button>
      </div>
      {tab === "backtest" && (
        <button
          onClick={onRefreshBacktest}
          disabled={loadingBacktest}
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          title="Refresh backtest (force recompute)"
        >
          <RefreshCw className={`h-4 w-4 ${loadingBacktest ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
