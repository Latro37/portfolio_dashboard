"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Auto-refresh hook: calls `fn` on a fixed interval and tracks the last refresh time.
 * Returns `{ lastRefreshed, refresh }` where `refresh` can be called manually.
 */
export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs = 60_000,
) {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    await fnRef.current();
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      fnRef.current();
      setLastRefreshed(new Date());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { lastRefreshed, refresh };
}
