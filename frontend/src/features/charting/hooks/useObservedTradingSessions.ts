import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { TradingDayEvidence } from "@/features/charting/tradingCalendar";
import { getTradingSessionsQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toMinMaxIsoDates(dates: string[]): { minDate: string; maxDate: string } | null {
  const valid = dates.filter((date) => ISO_DATE_PATTERN.test(date));
  if (!valid.length) return null;

  let minDate = valid[0];
  let maxDate = valid[0];
  for (const date of valid) {
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
  }
  return { minDate, maxDate };
}

function buildSessionQueryRange(dates: string[]): { startDate: string; endDate: string } | null {
  const bounds = toMinMaxIsoDates(dates);
  if (!bounds) return null;
  return { startDate: bounds.minDate, endDate: bounds.maxDate };
}

export function useObservedTradingSessions(dates: string[]): TradingDayEvidence {
  const range = useMemo(() => buildSessionQueryRange(dates), [dates]);
  const sessionsQuery = useQuery({
    queryKey: range
      ? queryKeys.tradingSessions({ ...range, exchange: "XNYS" })
      : queryKeys.tradingSessions({ startDate: "", endDate: "", exchange: "XNYS" }),
    queryFn: () =>
      range
        ? getTradingSessionsQueryFn({ ...range, exchange: "XNYS" })
        : Promise.resolve<string[]>([]),
    enabled: Boolean(range),
    staleTime: 60 * 60 * 1000,
  });

  return useMemo<TradingDayEvidence>(() => {
    const sessionDates = sessionsQuery.data ?? [];
    if (!sessionDates.length) return {};

    let observedStartDate = sessionDates[0];
    let observedEndDate = sessionDates[0];
    for (const date of sessionDates) {
      if (date < observedStartDate) observedStartDate = date;
      if (date > observedEndDate) observedEndDate = date;
    }

    return {
      observedTradingDates: new Set(sessionDates),
      observedStartDate,
      observedEndDate,
    };
  }, [sessionsQuery.data]);
}
