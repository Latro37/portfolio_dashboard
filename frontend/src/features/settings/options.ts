import { DEFAULT_METRICS } from "@/features/dashboard/snapshot/metricCards";
import type { ScreenshotConfig } from "@/lib/api";

export const CHART_MODES = [
  { value: "twr", label: "TWR" },
  { value: "portfolio", label: "Portfolio Value" },
  { value: "mwr", label: "MWR" },
  { value: "drawdown", label: "Drawdown" },
];

export const PERIOD_OPTIONS = [
  { value: "1W", label: "1 Week" },
  { value: "1M", label: "1 Month" },
  { value: "3M", label: "3 Months" },
  { value: "YTD", label: "Year to Date" },
  { value: "1Y", label: "1 Year" },
  { value: "ALL", label: "All Time" },
  { value: "custom", label: "Custom Start Date" },
];

export const defaultScreenshot: ScreenshotConfig = {
  enabled: false,
  local_path: "",
  account_id: "",
  chart_mode: "twr",
  period: "ALL",
  custom_start: "",
  hide_portfolio_value: false,
  metrics: [...DEFAULT_METRICS],
  benchmarks: [],
};
