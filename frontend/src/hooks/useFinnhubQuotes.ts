"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { isMarketOpen } from "@/lib/marketHours";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const WS_BASE = API_BASE.replace(/^http/, "ws");

export interface QuoteData {
  price: number;
  change: number;
  changePct: number;
}

/**
 * Finnhub WebSocket hook — streams real-time trade prices for a list of symbols.
 *
 * All Finnhub communication is proxied through the backend so the API key
 * never reaches the browser.
 *
 * Auto-reconnects with exponential backoff (max 30s).
 * Only active during regular market hours (9:30 AM – 4:00 PM ET, weekdays).
 */
export function useFinnhubQuotes(
  symbols: string[],
  finnhubEnabled: boolean,
): { quotes: Record<string, QuoteData>; connected: boolean } {
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [connected, setConnected] = useState(false);

  // Refs to survive re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const prevCloseRef = useRef<Record<string, number>>({});
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);
  const subscribedSymbols = useRef<Set<string>>(new Set());

  // Stable sorted key for symbols to avoid unnecessary reconnects
  const symbolsKey = [...symbols].sort().join(",");

  // Check if we should be connected (regular market hours only)
  const shouldConnect = useCallback((): boolean => {
    if (!finnhubEnabled || symbols.length === 0) return false;
    return isMarketOpen();
  }, [finnhubEnabled, symbols.length]);

  // Fetch previousClose for all symbols via backend proxy (market hours only)
  const fetchPreviousCloses = useCallback(async () => {
    if (!finnhubEnabled || symbols.length === 0 || !isMarketOpen()) return;
    const closes: Record<string, number> = {};
    try {
      const res = await fetch(
        `${API_BASE}/finnhub/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
      );
      if (res.ok) {
        const data: Record<string, { c?: number; pc?: number }> = await res.json();
        for (const [sym, q] of Object.entries(data)) {
          if (q.pc && q.pc > 0) {
            closes[sym] = q.pc;
          }
          if (q.c && q.c > 0 && q.pc && q.pc > 0) {
            const change = q.c - q.pc;
            const changePct = (change / q.pc) * 100;
            setQuotes((prev) => ({
              ...prev,
              [sym]: { price: q.c!, change, changePct },
            }));
          }
        }
      }
    } catch {
      // Silently skip — badge just won't show
    }
    prevCloseRef.current = { ...prevCloseRef.current, ...closes };
  }, [finnhubEnabled, symbols]);

  // Open WebSocket connection via backend proxy
  const connectWS = useCallback(() => {
    if (!finnhubEnabled || !mountedRef.current) return;

    // Clean up any existing connection
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
    }

    const ws = new WebSocket(`${WS_BASE}/finnhub/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setConnected(true);
      reconnectDelay.current = 1000; // reset backoff

      // Subscribe to all symbols
      subscribedSymbols.current.clear();
      for (const sym of symbols) {
        ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
        subscribedSymbols.current.add(sym);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== "trade" || !msg.data?.length) return;

        // Process trades — use the last trade per symbol in this batch
        const latestBySymbol: Record<string, number> = {};
        for (const trade of msg.data) {
          latestBySymbol[trade.s] = trade.p; // symbol → price
        }

        setQuotes((prev) => {
          const next = { ...prev };
          for (const [sym, price] of Object.entries(latestBySymbol)) {
            const pc = prevCloseRef.current[sym];
            if (pc && pc > 0) {
              const change = price - pc;
              const changePct = (change / pc) * 100;
              next[sym] = { price, change, changePct };
            } else {
              next[sym] = { price, change: 0, changePct: 0 };
            }
          }
          return next;
        });
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!mountedRef.current) return;
      // Reconnect with exponential backoff
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current && shouldConnect()) {
          connectWS();
        }
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [finnhubEnabled, symbols, shouldConnect]);

  // Main effect: fetch closes + connect WS when symbols or key change
  useEffect(() => {
    mountedRef.current = true;

    if (!finnhubEnabled || symbols.length === 0) {
      setQuotes({});
      setConnected(false);
      return;
    }

    // Only fetch and connect during market hours
    if (!isMarketOpen()) {
      setQuotes({});
      setConnected(false);
      return;
    }

    // Fetch previous closes, then connect WS
    fetchPreviousCloses().then(() => {
      if (mountedRef.current && shouldConnect()) {
        connectWS();
      }
    });

    // Periodic check: reconnect if we should be connected but aren't
    const checkInterval = setInterval(() => {
      if (shouldConnect() && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        connectWS();
      }
    }, 60_000);
    const subscribedSymbolsSnapshot = subscribedSymbols.current;

    return () => {
      mountedRef.current = false;
      clearInterval(checkInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      // Unsubscribe and close
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        for (const sym of subscribedSymbolsSnapshot) {
          try {
            wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: sym }));
          } catch { /* ignore */ }
        }
        wsRef.current.close();
      }
      wsRef.current = null;
      subscribedSymbolsSnapshot.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finnhubEnabled, symbolsKey]);

  return { quotes, connected };
}
