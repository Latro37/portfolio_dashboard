"use client";

import React from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

import { useTradePreviewData } from "@/features/trade-preview/hooks/useTradePreviewData";
import type { TradePreviewProps } from "@/features/trade-preview/types";
import { formatTradeDollar } from "@/features/trade-preview/utils";

export function TradePreview({
  accountId,
  portfolioValue,
  onSymphonyClick,
  autoRefreshEnabled = true,
  finnhubConfigured,
}: TradePreviewProps) {
  const {
    grouped,
    loading,
    error,
    expanded,
    lastRefreshed,
    isFinalPreview,
    priceQuotes,
    fetchPreview,
    toggleExpand,
  } = useTradePreviewData({
    accountId,
    autoRefreshEnabled,
    finnhubConfigured,
  });

  const handleSymphonyClick = (e: React.MouseEvent, symphonyId: string) => {
    e.stopPropagation();
    onSymphonyClick?.(symphonyId);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Next Automated Trade Preview
        </h3>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              {isFinalPreview
                ? "Final Trade Preview of the Day"
                : lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh trade preview"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!error && !loading && grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">No upcoming trades.</p>
      )}

      {loading && grouped.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      )}

      {grouped.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
          <table className="w-full" style={{ minWidth: 600 }}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-5 font-medium whitespace-nowrap">Ticker</th>
                <th className="pb-2 px-5 font-medium whitespace-nowrap">Side</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Shares</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Notional</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Today</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">
                  Weight Change
                </th>
                <th className="pb-2 pl-5 font-medium whitespace-nowrap w-full">
                  Symphony
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {grouped.map((row) => {
                const key = `${row.ticker}|${row.side}`;
                const isMulti = row.symphonies.length > 1;
                const isOpen = expanded.has(key);
                const allPrevZero = row.symphonies.every((s) => s.prevWeight === 0);
                const allNextZero = row.symphonies.every((s) => s.nextWeight === 0);
                const acctPrevWeight = allPrevZero
                  ? 0
                  : portfolioValue
                    ? Math.max(0, (row.totalPrevValue / portfolioValue) * 100)
                    : 0;
                const acctNextWeight = allNextZero
                  ? 0
                  : portfolioValue
                    ? Math.max(
                        0,
                        ((row.totalPrevValue + row.totalNotional) / portfolioValue) * 100,
                      )
                    : 0;
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-5 font-medium whitespace-nowrap">
                        {row.ticker}
                      </td>
                      <td
                        className={`py-2.5 px-5 font-semibold whitespace-nowrap ${
                          row.side === "BUY" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {row.side}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        {Math.abs(row.totalQuantity).toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-5 text-right whitespace-nowrap ${
                          row.side === "BUY" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatTradeDollar(row.totalNotional)}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        {priceQuotes[row.ticker] ? (
                          <span
                            className={`tabular-nums ${
                              priceQuotes[row.ticker].change >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {priceQuotes[row.ticker].change >= 0 ? "+" : ""}
                            {priceQuotes[row.ticker].changePct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap text-muted-foreground">
                        {acctPrevWeight.toFixed(1)}% &rarr; {acctNextWeight.toFixed(1)}%
                      </td>
                      <td className="py-2.5 pl-5">
                        {isMulti ? (
                          <button
                            onClick={() => toggleExpand(key)}
                            className="cursor-pointer inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            Multiple Trades ({row.symphonies.length})
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleSymphonyClick(e, row.symphonies[0].id)}
                            className="cursor-pointer text-muted-foreground hover:text-foreground truncate block w-full max-w-full transition-colors text-left"
                            title={row.symphonies[0].name}
                          >
                            {row.symphonies[0].name}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isMulti &&
                      isOpen &&
                      row.symphonies.map((sym) => (
                        <tr
                          key={`${key}-${sym.id}`}
                          className="border-b border-border/20 bg-muted/20"
                        >
                          <td className="py-1.5 pr-5" />
                          <td className="py-1.5 px-5" />
                          <td className="py-1.5 px-5" />
                          <td
                            className={`py-1.5 px-5 text-right whitespace-nowrap text-xs ${
                              row.side === "BUY"
                                ? "text-emerald-400/70"
                                : "text-red-400/70"
                            }`}
                          >
                            {formatTradeDollar(sym.notional)}
                          </td>
                          <td className="py-1.5 px-5" />
                          <td className="py-1.5 px-5 text-right whitespace-nowrap text-xs text-muted-foreground/70">
                            {sym.prevWeight.toFixed(1)}% &rarr;{" "}
                            {sym.nextWeight.toFixed(1)}%
                          </td>
                          <td className="py-1.5 pl-5">
                            <button
                              onClick={(e) => handleSymphonyClick(e, sym.id)}
                              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground truncate block w-full max-w-full transition-colors text-left"
                              title={sym.name}
                            >
                              {sym.name}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
