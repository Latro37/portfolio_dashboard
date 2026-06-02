import type { PerformancePoint } from "@/lib/api";

type LivePerformanceOverlayArgs = {
  base: PerformancePoint[];
  livePv: number;
  liveNd: number;
  today: string;
};

export function buildLivePerformanceOverlay({
  base,
  livePv,
  liveNd,
  today,
}: LivePerformanceOverlayArgs): PerformancePoint[] {
  if (!base.length) return [];

  const lastPoint = base[base.length - 1];
  const replacesToday = lastPoint.date === today;
  const prefix = replacesToday ? base.slice(0, -1) : base;
  const previousPoint = prefix[prefix.length - 1];

  const depositDelta = previousPoint ? liveNd - previousPoint.net_deposits : 0;
  const dailyReturnPct =
    previousPoint && previousPoint.portfolio_value > 0
      ? ((livePv - previousPoint.portfolio_value - depositDelta) /
          previousPoint.portfolio_value) *
        100
      : 0;
  const cumulativeReturnPct =
    liveNd > 0 ? ((livePv - liveNd) / liveNd) * 100 : 0;
  const prevTwr = previousPoint?.time_weighted_return || 0;
  const liveTwr =
    previousPoint
      ? ((1 + prevTwr / 100) * (1 + dailyReturnPct / 100) - 1) * 100
      : 0;
  const twrPeak = Math.max(
    ...prefix.map((point) => 1 + (point.time_weighted_return || 0) / 100),
    1 + liveTwr / 100,
  );
  const liveDrawdown = twrPeak > 0 ? ((1 + liveTwr / 100) / twrPeak - 1) * 100 : 0;

  const todayPoint: PerformancePoint = {
    date: today,
    portfolio_value: livePv,
    net_deposits: liveNd,
    cumulative_return_pct: cumulativeReturnPct,
    daily_return_pct: dailyReturnPct,
    time_weighted_return: liveTwr,
    money_weighted_return:
      lastPoint.date === today
        ? lastPoint.money_weighted_return || 0
        : previousPoint?.money_weighted_return || 0,
    current_drawdown: Math.min(liveDrawdown, 0),
  };

  return [...prefix, todayPoint];
}
