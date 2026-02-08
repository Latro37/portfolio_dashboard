"use client";

import { Summary } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Period = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

interface Props {
  summary: Summary;
  period: Period;
  onPeriodChange: (p: Period) => void;
  onSync: () => void;
  syncing: boolean;
}

export function PortfolioHeader({ summary, period, onPeriodChange, onSync, syncing }: Props) {
  const dailyPositive = summary.daily_return_pct >= 0;
  const totalPositive = summary.total_return_dollars >= 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Portfolio Value</p>
        <h1 className="text-4xl font-bold tracking-tight">
          ${summary.portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm">
          <span className={totalPositive ? "text-emerald-400" : "text-red-400"}>
            {totalPositive ? "+" : ""}${summary.total_return_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={dailyPositive ? "text-emerald-400" : "text-red-400"}>
            {dailyPositive ? "+" : ""}{summary.daily_return_pct.toFixed(2)}% today
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Period pills */}
        <div className="flex rounded-lg bg-muted p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Sync button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={syncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing" : "Update"}
        </Button>
      </div>
    </div>
  );
}
