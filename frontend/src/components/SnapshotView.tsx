"use client";

import { forwardRef } from "react";
import { Summary, PerformancePoint } from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type ChartMode = "portfolio" | "twr" | "mwr" | "drawdown";

export const METRIC_OPTIONS: { key: string; label: string }[] = [
  { key: "annualized_return_cum", label: "Annualized Return" },
  { key: "twr", label: "TWR" },
  { key: "cumulative_return_pct", label: "Cumulative Return" },
  { key: "mwr", label: "MWR" },
  { key: "win_rate", label: "Win Rate" },
  { key: "wl", label: "W / L" },
  { key: "sharpe", label: "Sharpe" },
  { key: "calmar", label: "Calmar" },
  { key: "volatility", label: "Volatility" },
  { key: "max_drawdown", label: "Max Drawdown" },
  { key: "best_day", label: "Best Day" },
  { key: "worst_day", label: "Worst Day" },
];

export const DEFAULT_METRICS = [
  "twr", "sharpe", "max_drawdown", "volatility",
  "cumulative_return_pct", "calmar", "win_rate", "best_day",
];

interface Props {
  data: PerformancePoint[];
  summary: Summary;
  chartMode: ChartMode;
  selectedMetrics: string[];
  hidePortfolioValue: boolean;
  todayDollarChange?: number;
  todayPctChange?: number;
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

function getMetricValue(key: string, s: Summary): string {
  switch (key) {
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
    case "best_day": return fmtPct(s.best_day_pct);
    case "worst_day": return fmtPct(s.worst_day_pct);
    default: return "—";
  }
}

function getMetricColor(key: string, s: Summary): string {
  switch (key) {
    case "annualized_return_cum": return colorPct(s.annualized_return_cum);
    case "twr": return colorPct(s.time_weighted_return);
    case "cumulative_return_pct": return colorPct(s.cumulative_return_pct);
    case "mwr": return colorPct(s.money_weighted_return_period);
    case "max_drawdown": return "#ef4444";
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
    { data, summary, chartMode, selectedMetrics, hidePortfolioValue, todayDollarChange, todayPctChange },
    ref,
  ) {
    const tradingData = data.filter((pt) => {
      const day = new Date(pt.date + "T00:00").getDay();
      return day !== 0 && day !== 6;
    });

    const hasData = tradingData.length > 0;
    const todayStr = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const dayPct = todayPctChange ?? summary.daily_return_pct;
    const dayDollar = todayDollarChange ?? 0;

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

    if (hidePortfolioValue) {
      metricCards.push({
        label: "Today",
        value: fmtPct(dayPct),
        color: colorPct(dayPct),
      });
    }

    for (const key of selectedMetrics) {
      metricCards.push({
        label: getMetricLabel(key),
        value: getMetricValue(key, summary),
        color: getMetricColor(key, summary),
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
                <div
                  style={{
                    fontSize: 14,
                    color: colorPct(dayPct),
                    marginTop: 2,
                  }}
                >
                  Today: {fmtDollar(dayDollar)} ({fmtPct(dayPct)})
                </div>
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
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Metric Cards */}
        {metricCards.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
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
