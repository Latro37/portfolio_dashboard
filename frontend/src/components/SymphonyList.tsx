"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SymphonyInfo } from "@/lib/api";
import { InfoTooltip, TWR_TOOLTIP_TEXT } from "./InfoTooltip";
import { RefreshCw } from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface Props {
  symphonies: SymphonyInfo[];
  showAccountColumn: boolean;
  onSelect: (symphony: SymphonyInfo) => void;
  onRefresh?: () => void | Promise<void>;
  refreshLoading?: boolean;
  autoRefreshEnabled?: boolean;
}

function fmtDollar(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function colorVal(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function SymphonyList({ symphonies, showAccountColumn, onSelect, onRefresh, refreshLoading, autoRefreshEnabled = true }: Props) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const initialSet = useRef(false);

  useEffect(() => {
    if (symphonies.length > 0 && !initialSet.current) {
      initialSet.current = true;
      setLastRefreshed(new Date());
    }
  }, [symphonies]);

  const wrappedRefresh = useCallback(async () => {
    await onRefresh?.();
    setLastRefreshed(new Date());
  }, [onRefresh]);

  useAutoRefresh(wrappedRefresh, 60_000, !!onRefresh && autoRefreshEnabled);

  if (!symphonies.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Symphonies</h3>
          {onRefresh && (
            <div className="flex items-center gap-3">
              {lastRefreshed && (
                <span className="text-xs text-muted-foreground">{lastRefreshed.toLocaleTimeString()}</span>
              )}
              <button
                onClick={wrappedRefresh}
                disabled={refreshLoading}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Refresh symphonies"
              >
                <RefreshCw className={`h-4 w-4 ${refreshLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">No active symphonies found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Symphonies</h3>
        {onRefresh && (
          <div className="flex items-center gap-3">
            {lastRefreshed && (
              <span className="text-xs text-muted-foreground">{lastRefreshed.toLocaleTimeString()}</span>
            )}
            <button
              onClick={wrappedRefresh}
              disabled={refreshLoading}
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="Refresh symphonies"
            >
              <RefreshCw className={`h-4 w-4 ${refreshLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}
      </div>
      <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
              {showAccountColumn && <th className="pb-2 pr-3 font-medium whitespace-nowrap">Account</th>}
              <th className="pb-2 pr-3 font-medium w-full">Name</th>
              <th className="pb-2 pr-3 font-medium text-right whitespace-nowrap">Today</th>
              <th className="pb-2 pr-3 font-medium text-right whitespace-nowrap">Deposits</th>
              <th className="pb-2 pr-3 font-medium text-right whitespace-nowrap">Value</th>
              <th className="pb-2 pr-3 font-medium text-right whitespace-nowrap">Profit</th>
              <th className="pb-2 pr-3 font-medium text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1 justify-end">
                  Return
                  <InfoTooltip text="Cumulative Return" />
                </span>
              </th>
              <th className="pb-2 font-medium text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1 justify-end">
                  TWR
                  <InfoTooltip text="Time Weighted Return" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {symphonies.map((s) => (
              <tr
                key={`${s.account_id}-${s.id}`}
                onClick={() => onSelect(s)}
                className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
              >
                {showAccountColumn && (
                  <td className="py-2.5 pr-3 text-muted-foreground max-w-[120px] truncate">{s.account_name}</td>
                )}
                <td className="py-2.5 pr-3 font-medium truncate" title={s.name}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate">{s.name}</span>
                  </div>
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  <span className={colorVal(s.last_percent_change)}>
                    {fmtPct(s.last_percent_change)}
                  </span>
                  <span className={`block text-xs ${colorVal(s.last_dollar_change)}`}>
                    {fmtDollar(s.last_dollar_change)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  ${s.net_deposits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  ${s.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${colorVal(s.total_return)}`}>
                  {fmtDollar(s.total_return)}
                </td>
                <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${colorVal(s.cumulative_return_pct)}`}>
                  {fmtPct(s.cumulative_return_pct)}
                </td>
                <td className={`py-2.5 text-right whitespace-nowrap ${colorVal(s.time_weighted_return)}`}>
                  {fmtPct(s.time_weighted_return)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
