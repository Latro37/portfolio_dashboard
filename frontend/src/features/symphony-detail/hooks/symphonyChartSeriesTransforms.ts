import type {
  BenchmarkEntry,
  BenchmarkPoint,
  PerformancePoint,
  SymphonyBacktest,
} from "@/lib/api";
import type { SymphonyDetailPeriod } from "@/features/symphony-detail/types";
import {
  epochDayToDate,
  isWeekday,
  periodStartDate,
} from "@/features/symphony-detail/utils";
import type {
  BacktestChartPoint,
  LiveChartPoint,
} from "@/features/symphony-detail/hooks/symphonyChartModelTypes";
import type { TradingDayEvidence } from "@/features/charting/tradingCalendar";

function getDateRange(
  period: SymphonyDetailPeriod,
  customStart: string,
  customEnd: string,
  oosDate: string,
) {
  return {
    start: customStart || (period === "OOS" ? oosDate : periodStartDate(period)),
    end: customEnd || "",
  };
}

export function calcTwrOffset(data: { twr: number }[]) {
  if (!data.length) return 0.5;
  const vals = data.map((d) => d.twr);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

export function filterLiveData(
  liveData: PerformancePoint[],
  period: SymphonyDetailPeriod,
  customStart: string,
  customEnd: string,
  oosDate: string,
  tradingDayEvidence: TradingDayEvidence = {},
) {
  if (!liveData.length) return [];

  const { start, end } = getDateRange(period, customStart, customEnd, oosDate);
  if (!start && !end) return liveData.filter((point) => isWeekday(point.date, tradingDayEvidence));

  return liveData.filter((point) => {
    if (!isWeekday(point.date, tradingDayEvidence)) return false;
    if (start && point.date < start) return false;
    if (end && point.date > end) return false;
    return true;
  });
}

export function buildBacktestChartData(backtest: SymphonyBacktest | null): BacktestChartPoint[] {
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
}

export function filterBacktestData(
  backtestChartData: BacktestChartPoint[],
  period: SymphonyDetailPeriod,
  customStart: string,
  customEnd: string,
  oosDate: string,
  tradingDayEvidence: TradingDayEvidence = {},
): BacktestChartPoint[] {
  if (!backtestChartData.length) return [];

  const { start, end } = getDateRange(period, customStart, customEnd, oosDate);
  if (!start && !end) {
    return backtestChartData.filter((point) => isWeekday(point.date, tradingDayEvidence));
  }

  const filtered = backtestChartData.filter((point) => {
    if (!isWeekday(point.date, tradingDayEvidence)) return false;
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
}

export function mergeLiveData(
  filteredLiveData: PerformancePoint[],
  filteredBacktestData: BacktestChartPoint[],
): LiveChartPoint[] {
  if (!filteredLiveData.length) return filteredLiveData as LiveChartPoint[];

  const liveBaseFactor = 1 + filteredLiveData[0].time_weighted_return / 100;
  const liveMwrBaseFactor = 1 + filteredLiveData[0].money_weighted_return / 100;
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
    const rebasedMwr =
      liveMwrBaseFactor !== 0
        ? ((1 + point.money_weighted_return / 100) / liveMwrBaseFactor - 1) * 100
        : point.money_weighted_return;
    const growth = 1 + rebasedTwr / 100;
    peakGrowth = Math.max(peakGrowth, growth);
    const rebasedDd = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
    return {
      ...point,
      time_weighted_return: rebasedTwr,
      money_weighted_return: rebasedMwr,
      current_drawdown: rebasedDd,
      backtestTwr:
        btByDate[point.date] != null && btBaseFactor != null && btBaseFactor !== 0
          ? ((1 + btByDate[point.date] / 100) / btBaseFactor - 1) * 100
          : null,
      backtestDrawdown: btDdByDate[point.date] ?? null,
    };
  });
}

export function mergeBacktestData(
  filteredBacktestData: BacktestChartPoint[],
  filteredLiveData: PerformancePoint[],
  benchmarks: BenchmarkEntry[],
): BacktestChartPoint[] {
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
        const benchmarkPoint = map.get(point.date);
        if (benchmarkPoint != null) {
          baseGrowth = 1 + benchmarkPoint.return_pct / 100;
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
      const benchmarkPoint = state.map.get(point.date);
      if (benchmarkPoint != null && state.baseGrowth !== 0) {
        state.lastReturn = ((1 + benchmarkPoint.return_pct / 100) / state.baseGrowth - 1) * 100;
        const growth = 1 + state.lastReturn / 100;
        state.peak = Math.max(state.peak, growth);
        state.lastDd = state.peak > 0 ? (growth / state.peak - 1) * 100 : 0;
      }
      merged[`bench_${i}_return`] = state.lastReturn;
      merged[`bench_${i}_drawdown`] = state.lastDd;
    });
    return merged;
  });
}
