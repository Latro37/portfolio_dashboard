"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { api, TradePreviewItem } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { isMarketOpen } from "@/lib/marketHours";

interface PriceQuote {
  price: number;
  change: number;
  changePct: number;
}

interface Props {
  accountId?: string;
  portfolioValue?: number;
  onSymphonyClick?: (symphonyId: string) => void;
  autoRefreshEnabled?: boolean;
  finnhubConfigured?: boolean;
}

interface SymphonyBreakdown {
  id: string;
  name: string;
  notional: number;
  quantity: number;
  prevWeight: number;
  nextWeight: number;
}

interface GroupedRow {
  ticker: string;
  side: "BUY" | "SELL";
  totalNotional: number;
  totalQuantity: number;
  totalPrevValue: number;
  symphonies: SymphonyBreakdown[];
}

function fmtDollar(v: number): string {
  return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export function TradePreview({ accountId, portfolioValue, onSymphonyClick, autoRefreshEnabled = true, finnhubConfigured }: Props) {
  const [trades, setTrades] = useState<TradePreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isFinalPreview, setIsFinalPreview] = useState(false);
  const [priceQuotes, setPriceQuotes] = useState<Record<string, PriceQuote>>({});
  const tradesRef = useRef<TradePreviewItem[]>([]);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  const fetchPrices = useCallback(async (tickers: string[]) => {
    if (!finnhubConfigured || tickers.length === 0 || !isMarketOpen()) return;
    const results: Record<string, PriceQuote> = {};
    try {
      const res = await fetch(
        `${API_BASE}/finnhub/quote?symbols=${encodeURIComponent(tickers.join(","))}`,
      );
      if (res.ok) {
        const data: Record<string, { c?: number; pc?: number }> = await res.json();
        for (const [sym, q] of Object.entries(data)) {
          if (q.c && q.c > 0) {
            const change = q.pc && q.pc > 0 ? q.c - q.pc : 0;
            const changePct = q.pc && q.pc > 0 ? (change / q.pc) * 100 : 0;
            results[sym] = { price: q.c, change, changePct };
          }
        }
      }
    } catch { /* skip */ }
    setPriceQuotes((prev) => ({ ...prev, ...results }));
  }, [finnhubConfigured]);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTradePreview(accountId);
      const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      const pastCutoff = nowET.getHours() > 15 || (nowET.getHours() === 15 && nowET.getMinutes() >= 40);
      if (data.length === 0 && pastCutoff && tradesRef.current.length > 0) {
        setIsFinalPreview(true);
      } else {
        setTrades(data);
        setLastRefreshed(new Date());
        setIsFinalPreview(false);
        const uniqueTickers = [...new Set(data.map((t) => t.ticker))];
        await fetchPrices(uniqueTickers);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trade preview");
    } finally {
      setLoading(false);
    }
  }, [accountId, fetchPrices]);

  useEffect(() => {
    if (accountId) fetchPreview();
  }, [accountId, fetchPreview]);

  useAutoRefresh(fetchPreview, 60_000, autoRefreshEnabled);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group by ticker+side, aggregate notional/quantity, collect per-symphony details
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRow>();

    for (const t of trades) {
      const key = `${t.ticker}|${t.side}`;
      const existing = map.get(key);
      const breakdown: SymphonyBreakdown = {
        id: t.symphony_id,
        name: t.symphony_name,
        notional: t.notional,
        quantity: t.quantity,
        prevWeight: t.prev_weight,
        nextWeight: t.next_weight,
      };
      if (existing) {
        existing.totalNotional += t.notional;
        existing.totalQuantity += t.quantity;
        existing.totalPrevValue += t.prev_value;
        const already = existing.symphonies.find((s) => s.id === t.symphony_id);
        if (already) {
          already.notional += t.notional;
          already.quantity += t.quantity;
        } else {
          existing.symphonies.push(breakdown);
        }
      } else {
        map.set(key, {
          ticker: t.ticker,
          side: t.side,
          totalNotional: t.notional,
          totalQuantity: t.quantity,
          totalPrevValue: t.prev_value,
          symphonies: [breakdown],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.side !== b.side) return a.side === "SELL" ? -1 : 1;
      return Math.abs(b.totalNotional) - Math.abs(a.totalNotional);
    });
  }, [trades]);

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
              {isFinalPreview ? "Final Trade Preview of the Day" : lastRefreshed.toLocaleTimeString()}
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
        <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
          <table className="w-full" style={{ minWidth: 600 }}>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="pb-2 pr-5 font-medium whitespace-nowrap">Ticker</th>
                <th className="pb-2 px-5 font-medium whitespace-nowrap">Side</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Shares</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Notional</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Today</th>
                <th className="pb-2 px-5 font-medium text-right whitespace-nowrap">Weight Change</th>
                <th className="pb-2 pl-5 font-medium whitespace-nowrap w-full">Symphony</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {grouped.map((row) => {
                const key = `${row.ticker}|${row.side}`;
                const isMulti = row.symphonies.length > 1;
                const isOpen = expanded.has(key);
                const allPrevZero = row.symphonies.every((s) => s.prevWeight === 0);
                const allNextZero = row.symphonies.every((s) => s.nextWeight === 0);
                const acctPrevWeight = allPrevZero ? 0 : portfolioValue ? Math.max(0, (row.totalPrevValue / portfolioValue) * 100) : 0;
                const acctNextWeight = allNextZero ? 0 : portfolioValue ? Math.max(0, ((row.totalPrevValue + row.totalNotional) / portfolioValue) * 100) : 0;
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-5 font-medium whitespace-nowrap">{row.ticker}</td>
                      <td className={`py-2.5 px-5 font-semibold whitespace-nowrap ${row.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                        {row.side}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        {Math.abs(row.totalQuantity).toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-5 text-right whitespace-nowrap ${row.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                        {fmtDollar(row.totalNotional)}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        {priceQuotes[row.ticker] ? (
                          <span className={`tabular-nums ${priceQuotes[row.ticker].change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {priceQuotes[row.ticker].change >= 0 ? "+" : ""}{priceQuotes[row.ticker].changePct.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
                    {isMulti && isOpen && row.symphonies.map((sym) => (
                      <tr key={`${key}-${sym.id}`} className="border-b border-border/20 bg-muted/20">
                        <td className="py-1.5 pr-5" />
                        <td className="py-1.5 px-5" />
                        <td className="py-1.5 px-5" />
                        <td className={`py-1.5 px-5 text-right whitespace-nowrap text-xs ${row.side === "BUY" ? "text-emerald-400/70" : "text-red-400/70"}`}>
                          {fmtDollar(sym.notional)}
                        </td>
                        <td className="py-1.5 px-5" />
                        <td className="py-1.5 px-5 text-right whitespace-nowrap text-xs text-muted-foreground/70">
                          {sym.prevWeight.toFixed(1)}% &rarr; {sym.nextWeight.toFixed(1)}%
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
