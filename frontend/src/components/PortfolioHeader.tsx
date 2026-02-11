"use client";

import { ReactNode } from "react";
import { Summary } from "@/lib/api";
import { RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  summary: Summary;
  onSync: () => void;
  syncing: boolean;
  onSettings?: () => void;
  accountSwitcher?: ReactNode;
  liveToggle?: ReactNode;
  todayDollarChange?: number;
  todayPctChange?: number;
}

function fmtDollar(v: number) {
  const abs = Math.abs(v);
  const str = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${str}` : `-$${str}`;
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function PortfolioHeader({ summary, onSync, syncing, onSettings, accountSwitcher, liveToggle, todayDollarChange, todayPctChange }: Props) {
  const totalPositive = summary.total_return_dollars >= 0;
  const totalPct = summary.cumulative_return_pct;
  const dayDollar = todayDollarChange ?? 0;
  const dayPct = todayPctChange ?? summary.daily_return_pct;
  const dayPositive = dayPct >= 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Portfolio Value</p>
        <h1 className="text-4xl font-bold tracking-tight">
          ${summary.portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h1>
        <p className={`mt-1 text-sm ${totalPositive ? "text-emerald-400" : "text-red-400"}`}>
          Total: {fmtDollar(summary.total_return_dollars)} ({fmtPct(totalPct)})
        </p>
        <p className={`text-sm ${dayPositive ? "text-emerald-400" : "text-red-400"}`}>
          Today: {fmtDollar(dayDollar)} ({fmtPct(dayPct)})
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3">
          {liveToggle}
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
          {/* Settings button */}
          {onSettings && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSettings}
              className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
        {accountSwitcher && (
          <div className="flex items-center gap-3">
            {accountSwitcher}
          </div>
        )}
      </div>
    </div>
  );
}
