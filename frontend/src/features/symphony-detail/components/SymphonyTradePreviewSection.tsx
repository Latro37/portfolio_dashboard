"use client";

import { RefreshCw } from "lucide-react";

import { SymphonyTradePreview } from "@/lib/api";

type Props = {
  tradePreview: SymphonyTradePreview | null;
  tradePreviewRefreshedAt: Date | null;
  loadingTradePreview: boolean;
  onRefresh: () => void;
};

export function SymphonyTradePreviewSection({
  tradePreview,
  tradePreviewRefreshedAt,
  loadingTradePreview,
  onRefresh,
}: Props) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Next Automated Trade Preview
        </h3>
        <div className="flex items-center gap-3">
          {tradePreviewRefreshedAt && (
            <span className="text-xs text-muted-foreground">
              {tradePreviewRefreshedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loadingTradePreview}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh trade preview"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingTradePreview ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {loadingTradePreview && !tradePreview && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      )}

      {!loadingTradePreview &&
        (!tradePreview || tradePreview.recommended_trades.length === 0) && (
          <p className="text-sm text-muted-foreground">No upcoming trades.</p>
        )}

      {tradePreview && tradePreview.recommended_trades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Ticker</th>
                <th className="pb-2 pr-3 font-medium">Side</th>
                <th className="pb-2 pr-3 font-medium text-right">Shares</th>
                <th className="pb-2 pr-3 font-medium text-right">Est. Value</th>
                <th className="pb-2 pr-3 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">Weight Change</th>
              </tr>
            </thead>
            <tbody>
              {tradePreview.recommended_trades.map((trade, i) => (
                <tr
                  key={`${trade.ticker}-${trade.side}-${i}`}
                  className="border-b border-border/30"
                >
                  <td className="py-2 pr-3 font-medium">
                    {trade.ticker}
                    {trade.name && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {trade.name}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-3 font-semibold ${
                      trade.side === "BUY" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {trade.side}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {Math.abs(trade.share_change).toFixed(2)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right whitespace-nowrap ${
                      trade.side === "BUY" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    $
                    {Math.abs(trade.cash_change).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">
                    ${trade.average_price.toFixed(2)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-muted-foreground">
                    {trade.prev_weight.toFixed(1)}% {"->"} {trade.next_weight.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
