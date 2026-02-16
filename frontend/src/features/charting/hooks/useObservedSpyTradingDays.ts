import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { TradingDayEvidence } from "@/features/charting/tradingCalendar";
import { getSpyTradingSessionsQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SPY_INCEPTION_DATE = "1993-01-29";

function previousUtcDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

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

function buildSpySessionQueryRange(dates: string[]): { startDate: string; endDate: string } | null {
  const bounds = toMinMaxIsoDates(dates);
  if (!bounds) return null;

  const startDate = bounds.minDate < SPY_INCEPTION_DATE ? SPY_INCEPTION_DATE : bounds.minDate;
  let endDate = bounds.maxDate;
  const today = new Date().toISOString().slice(0, 10);
  if (endDate >= today) {
    endDate = previousUtcDate(today);
  }
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

export function useObservedSpyTradingDays(dates: string[]): TradingDayEvidence {
  const range = useMemo(() => buildSpySessionQueryRange(dates), [dates]);
  const sessionsQuery = useQuery({
    queryKey: range
      ? queryKeys.spyTradingSessions(range)
      : queryKeys.spyTradingSessions({ startDate: "", endDate: "" }),
    queryFn: () =>
      range ? getSpyTradingSessionsQueryFn(range) : Promise.resolve<string[]>([]),
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
