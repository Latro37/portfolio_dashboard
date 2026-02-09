/**
 * Check if US stock market is likely open (generous window).
 * Returns true on weekdays between 9:00 AM and 8:00 PM ET.
 * This captures pre-market, regular hours, and post-market moves.
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hour = et.getHours();
  return hour >= 9 && hour < 20;
}
