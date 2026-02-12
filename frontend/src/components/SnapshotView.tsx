"use client";

import { forwardRef } from "react";
import { Summary, PerformancePoint, BenchmarkPoint } from "@/lib/api";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type ChartMode = "portfolio" | "twr" | "mwr" | "drawdown";

export const METRIC_OPTIONS: { key: string; label: string }[] = [
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
  "twr", "sharpe", "max_drawdown", "volatility",
  "cumulative_return_pct", "calmar", "win_rate", "best_day",
];

export interface SnapshotBenchmark {
  ticker: string;
  data: BenchmarkPoint[];
  color: string;
}

interface Props {
  data: PerformancePoint[];
  summary: Summary;
  chartMode: ChartMode;
  selectedMetrics: string[];
  hidePortfolioValue: boolean;
  todayDollarChange?: number;
  todayPctChange?: number;
  periodReturns?: { "1W"?: number; "1M"?: number; "YTD"?: number };
  benchmarks?: SnapshotBenchmark[];
}

function fmtPct(v: number) {
  const s = v.toFixed(2) + "%";
  return v >= 0 ? "+" + s : s;
}

function fmtDollar(v: number) {
  const abs = Math.abs(v);
  const str = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${str}` : `-$${str}`;
}

function colorPct(v: number) {
  return v >= 0 ? "#10b981" : "#ef4444";
}

function getMetricValue(key: string, s: Summary, extra?: { todayDollar?: number; todayPct?: number; periodReturns?: { "1W"?: number; "1M"?: number; "YTD"?: number } }): string {
  switch (key) {
    case "today_dollar": return extra?.todayDollar != null ? fmtDollar(extra.todayDollar) : "—";
    case "today_pct": return extra?.todayPct != null ? fmtPct(extra.todayPct) : "—";
    case "return_1w": return extra?.periodReturns?.["1W"] != null ? fmtPct(extra.periodReturns["1W"]) : "—";
    case "return_1m": return extra?.periodReturns?.["1M"] != null ? fmtPct(extra.periodReturns["1M"]) : "—";
    case "return_ytd": return extra?.periodReturns?.YTD != null ? fmtPct(extra.periodReturns.YTD) : "—";
    case "annualized_return_cum": return fmtPct(s.annualized_return_cum);
    case "twr": return fmtPct(s.time_weighted_return);
    case "cumulative_return_pct": return fmtPct(s.cumulative_return_pct);
    case "mwr": return fmtPct(s.money_weighted_return_period);
    case "win_rate": return s.win_rate.toFixed(1) + "%";
    case "wl": return `${s.num_wins} / ${s.num_losses}`;
    case "sharpe": return s.sharpe_ratio.toFixed(2);
    case "calmar": return s.calmar_ratio.toFixed(2);
    case "volatility": return s.annualized_volatility.toFixed(1) + "%";
    case "max_drawdown": return fmtPct(s.max_drawdown);
    case "median_drawdown": return s.median_drawdown != null ? fmtPct(s.median_drawdown) : "—";
    case "longest_drawdown": return s.longest_drawdown_days != null ? s.longest_drawdown_days + "d" : "—";
    case "best_day": return fmtPct(s.best_day_pct);
    case "worst_day": return fmtPct(s.worst_day_pct);
    default: return "—";
  }
}

function getMetricColor(key: string, s: Summary, extra?: { todayDollar?: number; todayPct?: number; periodReturns?: { "1W"?: number; "1M"?: number; "YTD"?: number } }): string {
  switch (key) {
    case "today_dollar": return extra?.todayDollar != null ? colorPct(extra.todayDollar) : "#e4e4e7";
    case "today_pct": return extra?.todayPct != null ? colorPct(extra.todayPct) : "#e4e4e7";
    case "return_1w": return extra?.periodReturns?.["1W"] != null ? colorPct(extra.periodReturns["1W"]) : "#e4e4e7";
    case "return_1m": return extra?.periodReturns?.["1M"] != null ? colorPct(extra.periodReturns["1M"]) : "#e4e4e7";
    case "return_ytd": return extra?.periodReturns?.YTD != null ? colorPct(extra.periodReturns.YTD) : "#e4e4e7";
    case "annualized_return_cum": return colorPct(s.annualized_return_cum);
    case "twr": return colorPct(s.time_weighted_return);
    case "cumulative_return_pct": return colorPct(s.cumulative_return_pct);
    case "mwr": return colorPct(s.money_weighted_return_period);
    case "max_drawdown": return "#ef4444";
    case "median_drawdown": return "#ef4444";
    case "longest_drawdown": return "#e4e4e7";
    case "best_day": return "#10b981";
    case "worst_day": return "#ef4444";
    default: return "#e4e4e7";
  }
}

function getMetricLabel(key: string): string {
  return METRIC_OPTIONS.find((m) => m.key === key)?.label ?? key;
}

export const SnapshotView = forwardRef<HTMLDivElement, Props>(
  function SnapshotView(
    { data, summary, chartMode, selectedMetrics, hidePortfolioValue, todayDollarChange, todayPctChange, periodReturns, benchmarks = [] },
    ref,
  ) {
    const rawTradingData = data.filter((pt) => {
      const day = new Date(pt.date + "T00:00").getDay();
      return day !== 0 && day !== 6;
    });

    // Merge benchmark data into trading data by date (mirrors PerformanceChart logic)
    const tradingData = (() => {
      if (!benchmarks.length || !rawTradingData.length) return rawTradingData;
      const benchStates = benchmarks.map((b) => {
        const map = new Map<string, BenchmarkPoint>(b.data.map((pt) => [pt.date, pt]));
        // Find baseGrowth from the first matching trading date (not just the first date)
        let baseGrowth: number | null = null;
        for (const pt of rawTradingData) {
          const bp = map.get(pt.date);
          if (bp != null) { baseGrowth = 1 + bp.return_pct / 100; break; }
        }
        return { map, baseGrowth: baseGrowth ?? 1, ticker: b.ticker, peak: 1, lastReturn: undefined as number | undefined, lastDd: undefined as number | undefined };
      });
      return rawTradingData.map((pt) => {
        const merged: Record<string, unknown> = { ...pt };
        benchStates.forEach((bs) => {
          const bpt = bs.map.get(pt.date);
          if (bpt != null) {
            const rebasedReturn = bs.baseGrowth !== 0 ? ((1 + bpt.return_pct / 100) / bs.baseGrowth - 1) * 100 : 0;
            const growth = 1 + rebasedReturn / 100;
            bs.peak = Math.max(bs.peak, growth);
            bs.lastReturn = rebasedReturn;
            bs.lastDd = bs.peak > 0 ? (growth / bs.peak - 1) * 100 : 0;
          }
          merged[`bench_${bs.ticker}`] = bs.lastReturn;
          merged[`bench_${bs.ticker}_dd`] = bs.lastDd;
        });
        return merged as PerformancePoint & Record<string, number>;
      });
    })();

    const hasData = tradingData.length > 0;
    const todayStr = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const dayPct = todayPctChange ?? summary.daily_return_pct;
    const dayDollar = todayDollarChange ?? 0;
    const hasTodayMetric = selectedMetrics.includes("today_dollar") || selectedMetrics.includes("today_pct");
    const extra = { todayDollar: dayDollar, todayPct: dayPct, periodReturns };

    const multiYear =
      hasData &&
      new Date(tradingData[0].date + "T00:00:00").getFullYear() !==
        new Date(tradingData[tradingData.length - 1].date + "T00:00:00").getFullYear();

    const formatDate = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      if (multiYear) {
        const yr = String(dt.getFullYear()).slice(-2);
        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " '" + yr;
      }
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    const formatValue = (v: number) =>
      "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    const formatPctAxis = (v: number) => v.toFixed(1) + "%";

    // Gradient offset for split coloring
    const calcGradientOffset = (key: keyof PerformancePoint) => {
      if (!hasData) return 0.5;
      const vals = tradingData.map((d) => Number(d[key]));
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      if (max <= 0) return 0;
      if (min >= 0) return 1;
      return max / (max - min);
    };

    const twrOffset = calcGradientOffset("time_weighted_return");
    const mwrOffset = calcGradientOffset("money_weighted_return");

    // Build metric cards
    const metricCards: { label: string; value: string; color: string }[] = [];

    if (hidePortfolioValue && !hasTodayMetric) {
      metricCards.push({
        label: "Today",
        value: fmtPct(dayPct),
        color: colorPct(dayPct),
      });
    }

    for (const key of selectedMetrics) {
      metricCards.push({
        label: getMetricLabel(key),
        value: getMetricValue(key, summary, extra),
        color: getMetricColor(key, summary, extra),
      });
    }

    return (
      <div
        ref={ref}
        style={{
          width: 1200,
          height: 900,
          backgroundColor: "#09090b",
          color: "#e4e4e7",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          padding: "32px 40px",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ position: "relative", marginBottom: hidePortfolioValue ? 16 : 8 }}>
          <div>
            <div
              style={{
                fontSize: 14,
                color: "#71717a",
                marginBottom: 4,
              }}
            >
              Portfolio Snapshot &middot; {todayStr}
            </div>
            {!hidePortfolioValue && (
              <>
                <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>
                  ${summary.portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {!hasTodayMetric && (
                <div
                  style={{
                    fontSize: 14,
                    color: colorPct(dayPct),
                    marginTop: 2,
                  }}
                >
                  Today: {fmtDollar(dayDollar)} ({fmtPct(dayPct)})
                </div>
              )}
              </>
            )}
          </div>
          <div style={{ position: "absolute", bottom: hidePortfolioValue ? 0 : 4, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 14, color: "#e4e4e7", fontWeight: 500 }}>
              {chartMode === "portfolio" ? "Portfolio Value vs. Net Deposits"
                : chartMode === "twr" ? "Time-Weighted Return"
                : chartMode === "mwr" ? "Money-Weighted Return"
                : "Drawdown"}
            </div>
            {hasData && (
              <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>
                {new Date(tradingData[0].date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" — "}
                {new Date(tradingData[tradingData.length - 1].date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {!hasData ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#71717a",
                fontSize: 14,
              }}
            >
              No data
            </div>
          ) : chartMode === "portfolio" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="snap-pvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="snap-depGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis tickFormatter={formatValue} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <Area type="monotone" dataKey="net_deposits" stroke="#6366f1" strokeWidth={1.5} fill="url(#snap-depGrad)" dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="portfolio_value" stroke="#10b981" strokeWidth={2} fill="url(#snap-pvGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : chartMode === "twr" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="snap-twrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset={twrOffset} stopColor="#10b981" stopOpacity={0.05} />
                    <stop offset={twrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="snap-twrStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={twrOffset} stopColor="#10b981" />
                    <stop offset={twrOffset} stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="time_weighted_return" stroke="url(#snap-twrStroke)" strokeWidth={2} fill="url(#snap-twrGrad)" dot={false} isAnimationActive={false} />
                {benchmarks.map((b) => (
                  <Line key={b.ticker} type="monotone" dataKey={`bench_${b.ticker}`} stroke={b.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : chartMode === "mwr" ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="snap-mwrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor="#d946ef" stopOpacity={0.3} />
                    <stop offset={mwrOffset} stopColor="#d946ef" stopOpacity={0.05} />
                    <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="snap-mwrStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={mwrOffset} stopColor="#d946ef" />
                    <stop offset={mwrOffset} stopColor="#ef4444" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="money_weighted_return" stroke="url(#snap-mwrStroke)" strokeWidth={2} fill="url(#snap-mwrGrad)" dot={false} isAnimationActive={false} />
                {benchmarks.map((b) => (
                  <Line key={b.ticker} type="monotone" dataKey={`bench_${b.ticker}`} stroke={b.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="snap-ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="current_drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#snap-ddGrad)" baseValue={0} dot={false} isAnimationActive={false} />
                {benchmarks.map((b) => (
                  <Line key={b.ticker} type="monotone" dataKey={`bench_${b.ticker}_dd`} stroke={b.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Benchmark legend below chart */}
        {benchmarks.length > 0 && chartMode !== "portfolio" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#71717a" }}>Benchmark{benchmarks.length > 1 ? "s" : ""}:</span>
            {benchmarks.map((b) => (
              <span
                key={b.ticker}
                style={{
                  display: "inline-block",
                  backgroundColor: `${b.color}20`,
                  color: b.color,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: `1px solid ${b.color}66`,
                }}
              >
                {b.ticker}
              </span>
            ))}
          </div>
        )}

        {/* Metric Cards */}
        {metricCards.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 12,
              marginTop: 20,
            }}
          >
            {metricCards.map((m, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "#18181b",
                  borderRadius: 12,
                  border: "1px solid #27272a",
                  padding: "12px 16px",
                }}
              >
                <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: m.color }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
