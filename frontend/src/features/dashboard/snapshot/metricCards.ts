import type { Summary } from "@/lib/api";
import type {
  SnapshotMetricCard,
  SnapshotMetricOption,
  SnapshotPeriodReturns,
} from "@/features/dashboard/snapshot/types";

const EMPTY_METRIC = "-";

export const METRIC_OPTIONS: SnapshotMetricOption[] = [
  { key: "today_dollar", label: "Today ($)" },
  { key: "today_pct", label: "Today (%)" },
  { key: "return_1w", label: "1W Return" },
  { key: "return_1m", label: "1M Return" },
  { key: "return_ytd", label: "YTD Return" },
  { key: "annualized_return_cum", label: "Annualized Return" },
  { key: "cumulative_return_pct", label: "Cumulative Return" },
  { key: "twr", label: "TWR" },
  { key: "mwr", label: "MWR" },
  { key: "win_rate", label: "Win Rate" },
  { key: "wl", label: "W / L" },
  { key: "sharpe", label: "Sharpe" },
  { key: "calmar", label: "Calmar" },
  { key: "volatility", label: "Volatility" },
  { key: "max_drawdown", label: "Max Drawdown" },
  { key: "median_drawdown", label: "Median Drawdown" },
  { key: "longest_drawdown", label: "Longest Drawdown" },
  { key: "best_day", label: "Best Day" },
  { key: "worst_day", label: "Worst Day" },
];

export const DEFAULT_METRICS = [
  "twr",
  "sharpe",
  "max_drawdown",
  "volatility",
  "cumulative_return_pct",
  "calmar",
  "win_rate",
  "best_day",
];

type MetricContext = {
  todayDollar?: number;
  todayPct?: number;
  periodReturns?: SnapshotPeriodReturns;
};

export function formatSnapshotPct(value: number) {
  const s = value.toFixed(2) + "%";
  return value >= 0 ? "+" + s : s;
}

export function formatSnapshotDollar(value: number) {
  const abs = Math.abs(value);
  const str = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value >= 0 ? `+$${str}` : `-$${str}`;
}

export function snapshotPctColor(value: number) {
  return value >= 0 ? "#10b981" : "#ef4444";
}

function getMetricValue(key: string, summary: Summary, context?: MetricContext): string {
  switch (key) {
    case "today_dollar":
      return context?.todayDollar != null
        ? formatSnapshotDollar(context.todayDollar)
        : EMPTY_METRIC;
    case "today_pct":
      return context?.todayPct != null
        ? formatSnapshotPct(context.todayPct)
        : EMPTY_METRIC;
    case "return_1w":
      return context?.periodReturns?.["1W"] != null
        ? formatSnapshotPct(context.periodReturns["1W"])
        : EMPTY_METRIC;
    case "return_1m":
      return context?.periodReturns?.["1M"] != null
        ? formatSnapshotPct(context.periodReturns["1M"])
        : EMPTY_METRIC;
    case "return_ytd":
      return context?.periodReturns?.YTD != null
        ? formatSnapshotPct(context.periodReturns.YTD)
        : EMPTY_METRIC;
    case "annualized_return_cum":
      return formatSnapshotPct(summary.annualized_return_cum);
    case "twr":
      return formatSnapshotPct(summary.time_weighted_return);
    case "cumulative_return_pct":
      return formatSnapshotPct(summary.cumulative_return_pct);
    case "mwr":
      return formatSnapshotPct(summary.money_weighted_return_period);
    case "win_rate":
      return summary.win_rate.toFixed(1) + "%";
    case "wl":
      return `${summary.num_wins} / ${summary.num_losses}`;
    case "sharpe":
      return summary.sharpe_ratio.toFixed(2);
    case "calmar":
      return summary.calmar_ratio.toFixed(2);
    case "volatility":
      return summary.annualized_volatility.toFixed(1) + "%";
    case "max_drawdown":
      return formatSnapshotPct(summary.max_drawdown);
    case "median_drawdown":
      return summary.median_drawdown != null
        ? formatSnapshotPct(summary.median_drawdown)
        : EMPTY_METRIC;
    case "longest_drawdown":
      return summary.longest_drawdown_days != null
        ? summary.longest_drawdown_days + "d"
        : EMPTY_METRIC;
    case "best_day":
      return formatSnapshotPct(summary.best_day_pct);
    case "worst_day":
      return formatSnapshotPct(summary.worst_day_pct);
    default:
      return EMPTY_METRIC;
  }
}

function getMetricColor(key: string, summary: Summary, context?: MetricContext): string {
  switch (key) {
    case "today_dollar":
      return context?.todayDollar != null
        ? snapshotPctColor(context.todayDollar)
        : "#e4e4e7";
    case "today_pct":
      return context?.todayPct != null ? snapshotPctColor(context.todayPct) : "#e4e4e7";
    case "return_1w":
      return context?.periodReturns?.["1W"] != null
        ? snapshotPctColor(context.periodReturns["1W"])
        : "#e4e4e7";
    case "return_1m":
      return context?.periodReturns?.["1M"] != null
        ? snapshotPctColor(context.periodReturns["1M"])
        : "#e4e4e7";
    case "return_ytd":
      return context?.periodReturns?.YTD != null
        ? snapshotPctColor(context.periodReturns.YTD)
        : "#e4e4e7";
    case "annualized_return_cum":
      return snapshotPctColor(summary.annualized_return_cum);
    case "twr":
      return snapshotPctColor(summary.time_weighted_return);
    case "cumulative_return_pct":
      return snapshotPctColor(summary.cumulative_return_pct);
    case "mwr":
      return snapshotPctColor(summary.money_weighted_return_period);
    case "max_drawdown":
      return "#ef4444";
    case "median_drawdown":
      return "#ef4444";
    case "longest_drawdown":
      return "#e4e4e7";
    case "best_day":
      return "#10b981";
    case "worst_day":
      return "#ef4444";
    default:
      return "#e4e4e7";
  }
}

function getMetricLabel(key: string): string {
  return METRIC_OPTIONS.find((metric) => metric.key === key)?.label ?? key;
}

export function buildSnapshotMetricCards(
  summary: Summary,
  selectedMetrics: string[],
  hidePortfolioValue: boolean,
  dayPct: number,
  hasTodayMetric: boolean,
  context: MetricContext,
): SnapshotMetricCard[] {
  const metricCards: SnapshotMetricCard[] = [];

  if (hidePortfolioValue && !hasTodayMetric) {
    metricCards.push({
      label: "Today",
      value: formatSnapshotPct(dayPct),
      color: snapshotPctColor(dayPct),
    });
  }

  for (const key of selectedMetrics) {
    metricCards.push({
      label: getMetricLabel(key),
      value: getMetricValue(key, summary, context),
      color: getMetricColor(key, summary, context),
    });
  }

  return metricCards;
}
