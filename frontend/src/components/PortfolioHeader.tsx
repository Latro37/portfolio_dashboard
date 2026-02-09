"use client";

import { ReactNode } from "react";
import { Summary } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  summary: Summary;
  onSync: () => void;
  syncing: boolean;
  accountSwitcher?: ReactNode;
  todayDollarChange?: number;
  todayPctChange?: number;
}

export function PortfolioHeader({ summary, onSync, syncing, accountSwitcher, todayDollarChange, todayPctChange }: Props) {
  const totalPositive = summary.total_return_dollars >= 0;
  const dayDollar = todayDollarChange ?? 0;
  const dayPct = todayPctChange ?? summary.daily_return_pct;
  const dayPositive = dayPct >= 0;

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
          <span className={dayPositive ? "text-emerald-400" : "text-red-400"}>
            {dayDollar >= 0 ? "+" : ""}${dayDollar.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {" "}
            ({dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%) today
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {accountSwitcher}
        {/* Sync button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={syncing}
          className="cursor-pointer gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing" : "Update"}
        </Button>
      </div>
    </div>
  );
}
