"use client";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { api, TradePreviewItem } from "@/lib/api";

interface Props {
  accountId?: string;
}

function fmtDollar(v: number): string {
  return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TradePreview({ accountId }: Props) {
  const [trades, setTrades] = useState<TradePreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTradePreview(accountId);
      setTrades(data);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trade preview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accountId) fetchPreview();
  }, [accountId]);

  // Group by ticker+side, aggregate notional/quantity, collect symphony names
  const grouped = useMemo(() => {
    const map = new Map<string, {
      ticker: string;
      side: "BUY" | "SELL";
      totalNotional: number;
      totalQuantity: number;
      symphonies: string[];
      prevWeight: number;
      nextWeight: number;
    }>();

    for (const t of trades) {
      const key = `${t.ticker}|${t.side}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalNotional += t.notional;
        existing.totalQuantity += t.quantity;
        if (!existing.symphonies.includes(t.symphony_name)) {
          existing.symphonies.push(t.symphony_name);
        }
      } else {
        map.set(key, {
          ticker: t.ticker,
          side: t.side,
          totalNotional: t.notional,
          totalQuantity: t.quantity,
          symphonies: [t.symphony_name],
          prevWeight: t.prev_weight,
          nextWeight: t.next_weight,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => Math.abs(b.totalNotional) - Math.abs(a.totalNotional)
    );
  }, [trades]);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Next Automated Trade Preview
        </h3>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchPreview}
            disabled={loading}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh trade preview"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {!error && !loading && grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">No upcoming trades.</p>
      )}

      {loading && grouped.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading preview…
        </div>
      )}

      {grouped.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto overflow-x-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-3 font-medium">Ticker</th>
                <th className="pb-2 pr-3 font-medium">Side</th>
                <th className="pb-2 pr-3 font-medium text-right">Shares</th>
                <th className="pb-2 pr-3 font-medium text-right">Notional</th>
                <th className="pb-2 pr-3 font-medium text-right">Weight Change</th>
                <th className="pb-2 font-medium">Symphony</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((row, i) => (
                <tr key={`${row.ticker}-${row.side}-${i}`} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium">{row.ticker}</td>
                  <td className={`py-2 pr-3 font-semibold ${row.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                    {row.side}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {Math.abs(row.totalQuantity).toFixed(2)}
                  </td>
                  <td className={`py-2 pr-3 text-right whitespace-nowrap ${row.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtDollar(row.totalNotional)}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">
                    {row.prevWeight.toFixed(1)}% → {row.nextWeight.toFixed(1)}%
                  </td>
                  <td className="py-2 text-muted-foreground truncate max-w-[200px]" title={row.symphonies.join(", ")}>
                    {row.symphonies.join(", ")}
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
