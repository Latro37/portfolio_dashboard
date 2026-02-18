import type { BenchmarkSeries, BenchmarkSeriesPoint, ChartSeriesPoint, BenchmarkKeyNames } from "./types";
import { isUsEquityTradingDay, type TradingDayEvidence } from "./tradingCalendar";

type BenchmarkState = {
  map: Map<string, BenchmarkSeriesPoint>;
  baseGrowth: number;
  baseMwr: number;
  peak: number;
  hasMwr: boolean;
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

export function isTradingDay(dateStr: string, evidence: TradingDayEvidence = {}): boolean {
  return isUsEquityTradingDay(dateStr, evidence);
}

export function filterTradingDays<T extends { date: string }>(
  points: T[],
  evidence: TradingDayEvidence = {},
): T[] {
  return points.filter((pt) => isTradingDay(pt.date, evidence));
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

function finiteNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function rebasePerformanceWindow(points: ChartSeriesPoint[]): ChartSeriesPoint[] {
  if (!points.length) return points;

  const firstTwr = finiteNumber(points[0].time_weighted_return);
  const firstMwr = finiteNumber(points[0].money_weighted_return);
  const twrBase = firstTwr != null ? 1 + firstTwr / 100 : null;
  const mwrBase = firstMwr != null ? 1 + firstMwr / 100 : null;

  let peakGrowth = 1;
  return points.map((point) => {
    const nextPoint: ChartSeriesPoint = { ...point };

    if (twrBase != null) {
      const twr = finiteNumber(point.time_weighted_return) ?? 0;
      const rebasedTwr =
        twrBase !== 0 ? ((1 + twr / 100) / twrBase - 1) * 100 : twr;
      const growth = 1 + rebasedTwr / 100;
      peakGrowth = Math.max(peakGrowth, growth);
      const rebasedDd = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
      nextPoint.time_weighted_return = rebasedTwr;
      nextPoint.current_drawdown = rebasedDd;
    }

    if (mwrBase != null) {
      const mwr = finiteNumber(point.money_weighted_return) ?? 0;
      nextPoint.money_weighted_return =
        mwrBase !== 0 ? ((1 + mwr / 100) / mwrBase - 1) * 100 : mwr;
    }

    return nextPoint;
  });
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
    const hasMwr = bench.data.some((pt) => pt.mwr_pct !== 0);
    let baseGrowth: number | null = null;
    let baseMwr: number | null = null;
    for (const point of basePoints) {
      const bPoint = map.get(point.date);
      if (bPoint) {
        baseGrowth = 1 + bPoint.return_pct / 100;
        if (hasMwr && bPoint.mwr_pct !== 0) {
          baseMwr = 1 + bPoint.mwr_pct / 100;
        }
        break;
      }
    }
    return {
      map,
      baseGrowth: baseGrowth ?? 1,
      baseMwr: baseMwr ?? 1,
      peak: 1,
      hasMwr,
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
        state.lastMwr =
          state.hasMwr && bPoint.mwr_pct !== 0 && state.baseMwr !== 0
            ? ((1 + bPoint.mwr_pct / 100) / state.baseMwr - 1) * 100
            : rebasedReturn;
      }

      merged[keyNames.returnKey(token)] = state.lastReturn;
      merged[keyNames.drawdownKey(token)] = state.lastDrawdown;
      if (keyNames.mwrKey) merged[keyNames.mwrKey(token)] = state.lastMwr;
    });

    return merged;
  });
}
