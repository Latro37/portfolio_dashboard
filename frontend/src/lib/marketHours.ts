import { isUsEquityTradingDay } from "@/features/charting/tradingCalendar";

/** Get current time in US Eastern. */
function nowET(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
}

/** Minutes since midnight for an ET Date. */
function minutesSinceMidnight(et: Date): number {
  return et.getHours() * 60 + et.getMinutes();
}

function isoDateFromET(et: Date): string {
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isTradingDayET(et: Date): boolean {
  return isUsEquityTradingDay(isoDateFromET(et));
}

const OPEN = 9 * 60 + 30; // 9:30 AM ET
const CLOSE = 16 * 60; // 4:00 PM ET
const CLOSE_BUF = 16 * 60 + 5; // 4:05 PM ET

/**
 * True during regular trading hours (9:30 AM - 4:00 PM ET) on trading days.
 */
export function isMarketOpen(): boolean {
  const et = nowET();
  if (!isTradingDayET(et)) return false;
  const m = minutesSinceMidnight(et);
  return m >= OPEN && m < CLOSE;
}

/**
 * True during market hours + 5 min buffer (9:30 AM - 4:05 PM ET) on trading days.
 * Use this to gate auto-refresh calls; the buffer captures final settlement data.
 */
export function isWithinTradingSession(): boolean {
  const et = nowET();
  if (!isTradingDayET(et)) return false;
  const m = minutesSinceMidnight(et);
  return m >= OPEN && m < CLOSE_BUF;
}

/**
 * True between market close (4:00 PM ET) and midnight on trading days.
 * Used to trigger a once-per-day post-close data update.
 */
export function isAfterClose(): boolean {
  const et = nowET();
  if (!isTradingDayET(et)) return false;
  const m = minutesSinceMidnight(et);
  return m >= CLOSE;
}

/**
 * Return today's date string in ET (YYYY-MM-DD).
 */
export function todayET(): string {
  return isoDateFromET(nowET());
}

