import type { BenchmarkSeries, BenchmarkSeriesPoint, ChartSeriesPoint, BenchmarkKeyNames } from "./types";
import { isUsEquityTradingDay } from "./tradingCalendar";

type BenchmarkState = {
  map: Map<string, BenchmarkSeriesPoint>;
  baseGrowth: number;
  peak: number;
  lastReturn?: number;
  lastDrawdown?: number;
  lastMwr?: number;
};

function defaultKeyNames(): BenchmarkKeyNames {
  return {
    returnKey: (token) => `bench_${token}_return`,
    drawdownKey: (token) => `bench_${token}_drawdown`,
    mwrKey: (token) => `bench_${token}_mwr`,
  };
}

export function isTradingDay(dateStr: string): boolean {
  return isUsEquityTradingDay(dateStr);
}

export function filterTradingDays<T extends { date: string }>(points: T[]): T[] {
  return points.filter((pt) => isTradingDay(pt.date));
}

export function calcGradientOffset(points: ChartSeriesPoint[], key: string): number {
  if (!points.length) return 0.5;
  const vals = points.map((d) => Number(d[key] ?? 0));
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max <= 0) return 0;
  if (min >= 0) return 1;
  return max / (max - min);
}

export function mergeBenchmarkSeries(
  basePoints: ChartSeriesPoint[],
  benchmarks: BenchmarkSeries[],
  tokenResolver: (bench: BenchmarkSeries, idx: number) => string,
  keyNames: BenchmarkKeyNames = defaultKeyNames(),
): ChartSeriesPoint[] {
  if (!benchmarks.length || !basePoints.length) return basePoints;

  const states: BenchmarkState[] = benchmarks.map((bench) => {
    const map = new Map<string, BenchmarkSeriesPoint>(bench.data.map((pt) => [pt.date, pt]));
    let baseGrowth: number | null = null;
    for (const point of basePoints) {
      const bPoint = map.get(point.date);
      if (bPoint) {
        baseGrowth = 1 + bPoint.return_pct / 100;
        break;
      }
    }
    return {
      map,
      baseGrowth: baseGrowth ?? 1,
      peak: 1,
    };
  });

  return basePoints.map((point) => {
    const merged: ChartSeriesPoint = { ...point };

    states.forEach((state, idx) => {
      const token = tokenResolver(benchmarks[idx], idx);
      const bPoint = state.map.get(point.date);
      if (bPoint) {
        const rebasedReturn =
          state.baseGrowth !== 0 ? ((1 + bPoint.return_pct / 100) / state.baseGrowth - 1) * 100 : 0;
        const growth = 1 + rebasedReturn / 100;
        state.peak = Math.max(state.peak, growth);
        state.lastReturn = rebasedReturn;
        state.lastDrawdown = state.peak > 0 ? (growth / state.peak - 1) * 100 : 0;
        state.lastMwr = bPoint.mwr_pct !== 0 ? bPoint.mwr_pct : rebasedReturn;
      }

      merged[keyNames.returnKey(token)] = state.lastReturn;
      merged[keyNames.drawdownKey(token)] = state.lastDrawdown;
      if (keyNames.mwrKey) merged[keyNames.mwrKey(token)] = state.lastMwr;
    });

    return merged;
  });
}
