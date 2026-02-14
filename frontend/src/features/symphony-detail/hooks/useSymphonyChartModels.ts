import { useMemo } from "react";

import {
  BenchmarkEntry,
  BenchmarkPoint,
  PerformancePoint,
  SymphonyBacktest,
  SymphonySummary,
} from "@/lib/api";
import { SymphonyDetailPeriod } from "@/features/symphony-detail/types";
import {
  epochDayToDate,
  isWeekday,
  makeDateFormatter,
  periodStartDate,
} from "@/features/symphony-detail/utils";

export type BacktestChartPoint = {
  date: string;
  value: number;
  twr: number;
  drawdown: number;
  [key: string]: number | string | null | undefined;
};

export type LiveChartPoint = PerformancePoint & {
  [key: string]: number | string | null | undefined;
};

export type SymphonyLiveMetricsView = {
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  maxDrawdownDate: string;
  annualized: number | null;
  calmar: number | null;
  winRate: number | null;
  bestDay: number | null;
  worstDay: number | null;
  bestDayDate: string;
  worstDayDate: string;
  cumReturn: number | null;
  twr: number | null;
  mwr: number | null;
  totalReturn: number | null;
  startDate: string;
  endDate: string;
};

export type SymphonyBacktestMetricsView = {
  cumReturn: number | null;
  annualized: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number | null;
  medianDrawdown: number | null;
  longestDrawdownDays: number | null;
  medianDrawdownDays: number | null;
  winRate: number | null;
  volatility: number | null;
  startDate: string;
  endDate: string;
};

type Args = {
  liveData: PerformancePoint[];
  backtest: SymphonyBacktest | null;
  liveSummary: SymphonySummary | null;
  benchmarks: BenchmarkEntry[];
  period: SymphonyDetailPeriod;
  customStart: string;
  customEnd: string;
  oosDate: string;
};

function calcTwrOffset(data: { twr: number }[]) {
  if (!data.length) return 0.5;
  const vals = data.map((d) => d.twr);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

export function useSymphonyChartModels({
  liveData,
  backtest,
  liveSummary,
  benchmarks,
  period,
  customStart,
  customEnd,
  oosDate,
}: Args) {
  const filteredLiveData = useMemo(() => {
    if (!liveData.length) return [];
    const start = customStart || (period === "OOS" ? oosDate : periodStartDate(period));
    const end = customEnd || "";
    if (!start && !end) return liveData.filter((point) => isWeekday(point.date));
    return liveData.filter((point) => {
      if (!isWeekday(point.date)) return false;
      if (start && point.date < start) return false;
      if (end && point.date > end) return false;
      return true;
    });
  }, [liveData, period, customStart, customEnd, oosDate]);

  const backtestChartData = useMemo<BacktestChartPoint[]>(() => {
    if (!backtest) return [];
    const dvm = backtest.dvm_capital;
    const symKeys = Object.keys(dvm);
    if (!symKeys.length) return [];
    const series = dvm[symKeys[0]];
    const dayNums = Object.keys(series)
      .map(Number)
      .sort((a, b) => a - b);
    if (!dayNums.length) return [];

    let twr = 1;
    let peak = 0;
    return dayNums.map((day, i) => {
      const val = series[String(day)];
      const prev = i > 0 ? series[String(dayNums[i - 1])] : val;
      const dailyRet = prev > 0 ? (val - prev) / prev : 0;
      if (i > 0) twr *= 1 + dailyRet;
      const twrPct = (twr - 1) * 100;
      peak = Math.max(peak, val);
      const drawdown = peak > 0 ? ((val - peak) / peak) * 100 : 0;
      return {
        date: epochDayToDate(day),
        value: val,
        twr: twrPct,
        drawdown,
      };
    });
  }, [backtest]);

  const filteredBacktestData = useMemo<BacktestChartPoint[]>(() => {
    if (!backtestChartData.length) return [];
    const start = customStart || (period === "OOS" ? oosDate : periodStartDate(period));
    const end = customEnd || "";
    if (!start && !end) return backtestChartData.filter((point) => isWeekday(point.date));
    const filtered = backtestChartData.filter((point) => {
      if (!isWeekday(point.date)) return false;
      if (start && point.date < start) return false;
      if (end && point.date > end) return false;
      return true;
    });
    if (!filtered.length) return [];
    let twr = 1;
    let peak = filtered[0].value;
    return filtered.map((point, i) => {
      if (i > 0) {
        const prev = filtered[i - 1].value;
        const dailyRet = prev > 0 ? (point.value - prev) / prev : 0;
        twr *= 1 + dailyRet;
      }
      peak = Math.max(peak, point.value);
      return {
        ...point,
        twr: (twr - 1) * 100,
        drawdown: peak > 0 ? ((point.value - peak) / peak) * 100 : 0,
      };
    });
  }, [backtestChartData, period, customStart, customEnd, oosDate]);

  const backtestTwrOffset = calcTwrOffset(filteredBacktestData);
  const btFormatDate = makeDateFormatter(filteredBacktestData);

  const mergedLiveData = useMemo<LiveChartPoint[]>(() => {
    if (!filteredLiveData.length) return filteredLiveData as LiveChartPoint[];

    const liveBaseFactor = 1 + filteredLiveData[0].time_weighted_return / 100;
    const btByDate: Record<string, number> = {};
    const btDdByDate: Record<string, number> = {};
    for (const point of filteredBacktestData) {
      btByDate[point.date] = point.twr;
      btDdByDate[point.date] = point.drawdown;
    }

    let btBaseFactor: number | null = null;
    for (const point of filteredLiveData) {
      if (btByDate[point.date] != null) {
        btBaseFactor = 1 + btByDate[point.date] / 100;
        break;
      }
    }

    let peakGrowth = 1;
    return filteredLiveData.map((point): LiveChartPoint => {
      const rebasedTwr =
        liveBaseFactor !== 0
          ? ((1 + point.time_weighted_return / 100) / liveBaseFactor - 1) * 100
          : point.time_weighted_return;
      const growth = 1 + rebasedTwr / 100;
      peakGrowth = Math.max(peakGrowth, growth);
      const rebasedDd = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
      return {
        ...point,
        time_weighted_return: rebasedTwr,
        current_drawdown: rebasedDd,
        backtestTwr:
          btByDate[point.date] != null && btBaseFactor != null && btBaseFactor !== 0
            ? ((1 + btByDate[point.date] / 100) / btBaseFactor - 1) * 100
            : null,
        backtestDrawdown: btDdByDate[point.date] ?? null,
      };
    });
  }, [filteredLiveData, filteredBacktestData]);

  const mergedBacktestData = useMemo<BacktestChartPoint[]>(() => {
    if (!filteredBacktestData.length) return filteredBacktestData;
    const liveByDate: Record<string, number> = {};
    for (const point of filteredLiveData) liveByDate[point.date] = point.time_weighted_return;

    let baseFactor: number | null = null;
    for (const point of filteredBacktestData) {
      if (liveByDate[point.date] != null) {
        baseFactor = 1 + liveByDate[point.date] / 100;
        break;
      }
    }

    const liveDdByDate: Record<string, number> = {};
    if (baseFactor != null && baseFactor !== 0) {
      let peakGrowth = 1;
      for (const point of filteredLiveData) {
        const rebasedTwr = ((1 + point.time_weighted_return / 100) / baseFactor - 1) * 100;
        const growth = 1 + rebasedTwr / 100;
        peakGrowth = Math.max(peakGrowth, growth);
        liveDdByDate[point.date] = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
      }
    }

    const benchStates = benchmarks
      .filter((benchmark) => benchmark.data.length > 0)
      .map((benchmark) => {
        const map = new Map(benchmark.data.map((point: BenchmarkPoint) => [point.date, point]));
        let baseGrowth: number | null = null;
        for (const point of filteredBacktestData) {
          const bp = map.get(point.date);
          if (bp != null) {
            baseGrowth = 1 + bp.return_pct / 100;
            break;
          }
        }
        return {
          map,
          baseGrowth: baseGrowth ?? 1,
          peak: 1,
          lastReturn: undefined as number | undefined,
          lastDd: undefined as number | undefined,
        };
      });

    return filteredBacktestData.map((point) => {
      const merged: BacktestChartPoint = {
        ...point,
        liveTwr:
          liveByDate[point.date] != null && baseFactor != null && baseFactor !== 0
            ? ((1 + liveByDate[point.date] / 100) / baseFactor - 1) * 100
            : null,
        liveDrawdown: liveDdByDate[point.date] ?? null,
      };
      benchStates.forEach((state, i) => {
        const bPoint = state.map.get(point.date);
        if (bPoint != null && state.baseGrowth !== 0) {
          state.lastReturn = ((1 + bPoint.return_pct / 100) / state.baseGrowth - 1) * 100;
          const growth = 1 + state.lastReturn / 100;
          state.peak = Math.max(state.peak, growth);
          state.lastDd = state.peak > 0 ? (growth / state.peak - 1) * 100 : 0;
        }
        merged[`bench_${i}_return`] = state.lastReturn;
        merged[`bench_${i}_drawdown`] = state.lastDd;
      });
      return merged;
    });
  }, [filteredBacktestData, filteredLiveData, benchmarks]);

  const liveMetrics = useMemo<SymphonyLiveMetricsView>(() => {
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
  }, [liveSummary, filteredLiveData]);

  const btMetrics = useMemo<SymphonyBacktestMetricsView>(() => {
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
    const summaryMetrics = backtest?.summary_metrics;
    if (
      summaryMetrics &&
      summaryMetrics.median_drawdown != null &&
      period === "ALL" &&
      !customStart &&
      !customEnd
    ) {
      return {
        cumReturn: summaryMetrics.cumulative_return_pct / 100,
        annualized:
          (summaryMetrics.annualized_return_cum ?? summaryMetrics.annualized_return) / 100,
        sharpe: summaryMetrics.sharpe_ratio,
        sortino: summaryMetrics.sortino_ratio,
        calmar: summaryMetrics.calmar_ratio,
        maxDrawdown: summaryMetrics.max_drawdown / 100,
        medianDrawdown: summaryMetrics.median_drawdown / 100,
        longestDrawdownDays: summaryMetrics.longest_drawdown_days,
        medianDrawdownDays: summaryMetrics.median_drawdown_days,
        winRate: summaryMetrics.win_rate / 100,
        volatility: summaryMetrics.annualized_volatility / 100,
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
    const downsideVar =
      downsideReturns.length > 0
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
    const medianDrawdown =
      ddTroughs.length > 0
        ? [...ddTroughs].sort((a, b) => a - b)[Math.floor(ddTroughs.length / 2)]
        : 0;
    const longestLen = ddLengths.length > 0 ? Math.max(...ddLengths) : 0;
    const medianDdLen =
      ddLengths.length > 0
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
  }, [filteredBacktestData, backtest, period, customStart, customEnd]);

  return {
    filteredLiveData,
    filteredBacktestData,
    mergedLiveData,
    mergedBacktestData,
    backtestTwrOffset,
    btFormatDate,
    liveMetrics,
    btMetrics,
  };
}
