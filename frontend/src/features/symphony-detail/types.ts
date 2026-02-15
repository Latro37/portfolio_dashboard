export type SymphonyDetailTab = "live" | "backtest";

export type SymphonyDetailPeriod =
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "YTD"
  | "1Y"
  | "ALL"
  | "OOS";

export const SYMPHONY_DETAIL_PERIODS: SymphonyDetailPeriod[] = [
  "1D",
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "ALL",
];
