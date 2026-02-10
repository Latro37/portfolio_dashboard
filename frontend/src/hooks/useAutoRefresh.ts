"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { isWithinTradingSession } from "@/lib/marketHours";

/**
 * Auto-refresh hook: calls `fn` on a fixed interval and tracks the last refresh time.
 * Returns `{ lastRefreshed, refresh }` where `refresh` can be called manually.
 *
 * By default, auto-refresh only fires during the trading session
 * (9:30 AM – 4:05 PM ET, weekdays).  Pass `marketHoursOnly: false` to
 * allow refreshing at any time.
 */
export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs = 60_000,
  enabled = true,
  marketHoursOnly = true,
) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    await fnRef.current();
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (marketHoursOnly && !isWithinTradingSession()) return;
      fnRef.current();
      setLastRefreshed(new Date());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled, marketHoursOnly]);

  return { lastRefreshed, refresh };
}
