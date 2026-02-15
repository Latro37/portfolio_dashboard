import type {
  PerformancePoint,
  SymphonyBacktest,
  SymphonySummary,
} from "@/lib/api";
import type { SymphonyDetailPeriod } from "@/features/symphony-detail/types";
import type {
  BacktestChartPoint,
  SymphonyBacktestMetricsView,
  SymphonyLiveMetricsView,
} from "@/features/symphony-detail/hooks/symphonyChartModelTypes";

export function buildLiveMetrics(
  liveSummary: SymphonySummary | null,
  filteredLiveData: PerformancePoint[],
): SymphonyLiveMetricsView {
  const empty: SymphonyLiveMetricsView = {
    sharpe: null,
    sortino: null,
    maxDrawdown: null,
    maxDrawdownDate: "",
    annualized: null,
    calmar: null,
    winRate: null,
    bestDay: null,
    worstDay: null,
    bestDayDate: "",
    worstDayDate: "",
    cumReturn: null,
    twr: null,
    mwr: null,
    totalReturn: null,
    startDate: "",
    endDate: "",
  };
  if (!liveSummary) return empty;

  let bestDayDate = "";
  let worstDayDate = "";
  let maxDrawdownDate = "";
  if (filteredLiveData.length >= 2) {
    const points = filteredLiveData.slice(1);
    let bestDay = -Infinity;
    let worstDay = Infinity;
    for (const point of points) {
      if (point.daily_return_pct > bestDay) {
        bestDay = point.daily_return_pct;
        bestDayDate = point.date;
      }
      if (point.daily_return_pct < worstDay) {
        worstDay = point.daily_return_pct;
        worstDayDate = point.date;
      }
    }

    let equity = 1;
    let eqPeak = 1;
    let maxDd = 0;
    for (let i = 0; i < filteredLiveData.length; i++) {
      if (i > 0) {
        const r = filteredLiveData[i].daily_return_pct / 100;
        equity *= 1 + r;
      }
      if (equity > eqPeak) eqPeak = equity;
      const dd = eqPeak > 0 ? equity / eqPeak - 1 : 0;
      if (dd < maxDd) {
        maxDd = dd;
        maxDrawdownDate = filteredLiveData[i].date;
      }
    }
  }

  return {
    sharpe: liveSummary.sharpe_ratio,
    sortino: liveSummary.sortino_ratio,
    maxDrawdown: liveSummary.max_drawdown,
    maxDrawdownDate,
    annualized: liveSummary.annualized_return_cum,
    calmar: liveSummary.calmar_ratio,
    winRate: liveSummary.win_rate,
    bestDay: liveSummary.best_day_pct,
    worstDay: liveSummary.worst_day_pct,
    bestDayDate,
    worstDayDate,
    cumReturn: liveSummary.cumulative_return_pct,
    twr: liveSummary.time_weighted_return,
    mwr: liveSummary.money_weighted_return_period,
    totalReturn: liveSummary.total_return_dollars,
    startDate: liveSummary.start_date,
    endDate: liveSummary.end_date,
  };
}

export function buildBacktestMetrics(
  filteredBacktestData: BacktestChartPoint[],
  backtest: SymphonyBacktest | null,
  period: SymphonyDetailPeriod,
  customStart: string,
  customEnd: string,
): SymphonyBacktestMetricsView {
  const empty: SymphonyBacktestMetricsView = {
    cumReturn: null,
    annualized: null,
    sharpe: null,
    sortino: null,
    calmar: null,
    maxDrawdown: null,
    medianDrawdown: null,
    longestDrawdownDays: null,
    medianDrawdownDays: null,
    winRate: null,
    volatility: null,
    startDate: "",
    endDate: "",
  };
  if (filteredBacktestData.length < 2) return empty;

  const first = filteredBacktestData[0];
  const last = filteredBacktestData[filteredBacktestData.length - 1];
  const startDate = first.date;
  const endDate = last.date;

  const summaryMetrics = backtest?.summary_metrics as Record<string, number | null | undefined> | undefined;
  if (
    summaryMetrics &&
    summaryMetrics["median_drawdown"] != null &&
    period === "ALL" &&
    !customStart &&
    !customEnd
  ) {
    return {
      cumReturn: (summaryMetrics["cumulative_return_pct"] ?? 0) / 100,
      annualized:
        ((summaryMetrics["annualized_return_cum"] ?? summaryMetrics["annualized_return"] ?? 0) /
          100),
      sharpe: summaryMetrics["sharpe_ratio"] ?? null,
      sortino: summaryMetrics["sortino_ratio"] ?? null,
      calmar: summaryMetrics["calmar_ratio"] ?? null,
      maxDrawdown: (summaryMetrics["max_drawdown"] ?? 0) / 100,
      medianDrawdown: (summaryMetrics["median_drawdown"] ?? 0) / 100,
      longestDrawdownDays: summaryMetrics["longest_drawdown_days"] ?? null,
      medianDrawdownDays: summaryMetrics["median_drawdown_days"] ?? null,
      winRate: (summaryMetrics["win_rate"] ?? 0) / 100,
      volatility: (summaryMetrics["annualized_volatility"] ?? 0) / 100,
      startDate,
      endDate,
    };
  }

  const dailyReturns = filteredBacktestData.slice(1).map((point, i) => {
    const prev = filteredBacktestData[i].value;
    return prev > 0 ? ((point.value - prev) / prev) * 100 : 0;
  });
  const n = dailyReturns.length;
  if (n === 0) return empty;

  const twrStart = 1 + (first.twr ?? 0) / 100;
  const twrEnd = 1 + (last.twr ?? 0) / 100;
  const cumReturn = twrStart > 0 ? twrEnd / twrStart - 1 : 0;
  const annualized = n > 0 ? Math.pow(1 + cumReturn, 252 / n) - 1 : 0;
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = dailyReturns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : null;
  const downsideReturns = dailyReturns.filter((r) => r < 0);
  const downsideVar = downsideReturns.length > 0
    ? downsideReturns.reduce((a, r) => a + r ** 2, 0) / n
    : 0;
  const downsideDev = Math.sqrt(downsideVar);
  const sortino = downsideDev > 0 ? (meanRet / downsideDev) * Math.sqrt(252) : null;

  let peak = first.value;
  let maxDd = 0;
  const ddTroughs: number[] = [];
  const ddLengths: number[] = [];
  let curTrough = 0;
  let curLen = 0;

  for (const point of filteredBacktestData) {
    if (point.value >= peak) {
      if (curLen > 0) {
        ddTroughs.push(curTrough);
        ddLengths.push(curLen);
        curTrough = 0;
        curLen = 0;
      }
      peak = point.value;
    } else {
      const dd = peak > 0 ? (point.value - peak) / peak : 0;
      curLen++;
      if (dd < curTrough) curTrough = dd;
      if (dd < maxDd) maxDd = dd;
    }
  }
  if (curLen > 0) {
    ddTroughs.push(curTrough);
    ddLengths.push(curLen);
  }

  const medianDrawdown = ddTroughs.length > 0
    ? [...ddTroughs].sort((a, b) => a - b)[Math.floor(ddTroughs.length / 2)]
    : 0;
  const longestLen = ddLengths.length > 0 ? Math.max(...ddLengths) : 0;
  const medianDdLen = ddLengths.length > 0
    ? [...ddLengths].sort((a, b) => a - b)[Math.floor(ddLengths.length / 2)]
    : 0;
  const calmar = maxDd < 0 ? annualized / Math.abs(maxDd) : null;
  const wins = dailyReturns.filter((r) => r > 0).length;
  const winRate = wins / n;

  return {
    cumReturn,
    annualized,
    sharpe,
    sortino,
    calmar,
    maxDrawdown: maxDd,
    medianDrawdown,
    longestDrawdownDays: longestLen,
    medianDrawdownDays: medianDdLen,
    winRate,
    volatility: stdDev / 100,
    startDate,
    endDate,
  };
}
