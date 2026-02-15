import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { TradePreviewItem } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { isMarketOpen } from "@/lib/marketHours";
import { getTradePreviewQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";
import type { PriceQuote } from "@/features/trade-preview/types";
import { groupTradePreviewRows } from "@/features/trade-preview/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

type Args = {
  accountId?: string;
  autoRefreshEnabled: boolean;
  finnhubConfigured?: boolean;
};

export function useTradePreviewData({
  accountId,
  autoRefreshEnabled,
  finnhubConfigured,
}: Args) {
  const [trades, setTrades] = useState<TradePreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isFinalPreview, setIsFinalPreview] = useState(false);
  const [priceQuotes, setPriceQuotes] = useState<Record<string, PriceQuote>>({});
  const tradesRef = useRef<TradePreviewItem[]>([]);
  const { refetch, isFetching } = useQuery({
    queryKey: queryKeys.tradePreview(accountId),
    queryFn: () => getTradePreviewQueryFn(accountId),
    enabled: false,
    staleTime: 30000,
  });

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  const fetchPrices = useCallback(
    async (tickers: string[]) => {
      if (!finnhubConfigured || tickers.length === 0 || !isMarketOpen()) return;

      const results: Record<string, PriceQuote> = {};
      try {
        const response = await fetch(
          `${API_BASE}/finnhub/quote?symbols=${encodeURIComponent(tickers.join(","))}`,
        );
        if (response.ok) {
          const data: Record<string, { c?: number; pc?: number }> =
            await response.json();
          for (const [symbol, quote] of Object.entries(data)) {
            if (quote.c && quote.c > 0) {
              const change = quote.pc && quote.pc > 0 ? quote.c - quote.pc : 0;
              const changePct = quote.pc && quote.pc > 0 ? (change / quote.pc) * 100 : 0;
              results[symbol] = { price: quote.c, change, changePct };
            }
          }
        }
      } catch {
        // Ignore quote fetch errors.
      }

      setPriceQuotes((previous) => ({ ...previous, ...results }));
    },
    [finnhubConfigured],
  );

  const fetchPreview = useCallback(async () => {
    setError(null);
    try {
      const result = await refetch();
      if (result.error || !result.data) {
        throw result.error ?? new Error("Failed to load trade preview");
      }

      const data = result.data;
      const nowET = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
      );
      const pastCutoff =
        nowET.getHours() > 15 || (nowET.getHours() === 15 && nowET.getMinutes() >= 40);

      if (data.length === 0 && pastCutoff && tradesRef.current.length > 0) {
        setIsFinalPreview(true);
      } else {
        setTrades(data);
        setLastRefreshed(new Date());
        setIsFinalPreview(false);
        const uniqueTickers = [...new Set(data.map((trade) => trade.ticker))];
        await fetchPrices(uniqueTickers);
      }
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Failed to load trade preview",
      );
    }
  }, [refetch, fetchPrices]);

  useEffect(() => {
    if (accountId) {
      void fetchPreview();
      return;
    }
    setTrades([]);
    setLastRefreshed(null);
    setIsFinalPreview(false);
  }, [accountId, fetchPreview]);

  useAutoRefresh(fetchPreview, 60_000, autoRefreshEnabled);

  const toggleExpand = (key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const grouped = useMemo(() => groupTradePreviewRows(trades), [trades]);

  return {
    grouped,
    loading: isFetching,
    error,
    expanded,
    lastRefreshed,
    isFinalPreview,
    priceQuotes,
    fetchPreview,
    toggleExpand,
  };
}
