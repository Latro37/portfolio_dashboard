"use client";

import { useState, useMemo } from "react";
import { PerformancePoint, BenchmarkPoint } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type ChartMode = "portfolio" | "twr" | "mwr" | "drawdown";

export type { ChartMode };

interface Props {
  data: PerformancePoint[];
  startDate: string;
  endDate: string;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  period: string;
  onPeriodChange: (p: string) => void;
  hideMWR?: boolean;
  hidePeriodControls?: boolean;
  portfolioLabel?: string;
  chartMode?: ChartMode;
  onChartModeChange?: (m: ChartMode) => void;
  overlayKey?: string;
  overlayLabel?: string;
  overlayColor?: string;
  showOverlay?: boolean;
  onOverlayToggle?: (v: boolean) => void;
  drawdownOverlayKey?: string;
  benchmarkData?: BenchmarkPoint[];
  benchmarkTicker?: string | null;
  onBenchmarkChange?: (ticker: string | null) => void;
}

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;

export function PerformanceChart({
  data,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  period,
  onPeriodChange,
  hideMWR,
  hidePeriodControls,
  portfolioLabel,
  chartMode: controlledMode,
  onChartModeChange,
  overlayKey,
  overlayLabel,
  overlayColor = "#6366f1",
  showOverlay = false,
  onOverlayToggle,
  drawdownOverlayKey,
  benchmarkData,
  benchmarkTicker,
  onBenchmarkChange,
}: Props) {
  const [internalMode, setInternalMode] = useState<ChartMode>("portfolio");
  const mode = controlledMode ?? internalMode;
  const setMode = onChartModeChange ?? setInternalMode;
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showDeposits, setShowDeposits] = useState(true);
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const BENCH_COLOR = "#f97316";

  // Filter out non-trading days (weekends) to avoid flat gaps in charts
  const rawTradingData = data.filter((pt) => {
    const day = new Date(pt.date + "T00:00").getDay();
    return day !== 0 && day !== 6;
  });

  // Merge benchmark data into trading data by date
  const tradingData = useMemo(() => {
    if (!benchmarkData || !benchmarkTicker) return rawTradingData;
    const benchMap = new Map(benchmarkData.map((b) => [b.date, b]));
    // Rebase benchmark return to start at 0 from the chart's first visible date
    const firstDate = rawTradingData[0]?.date;
    const firstBench = firstDate ? benchMap.get(firstDate) : null;
    const baseGrowth = firstBench ? 1 + firstBench.return_pct / 100 : 1;
    // Recompute drawdown from rebased benchmark equity curve
    let benchPeak = 1;
    return rawTradingData.map((pt) => {
      const b = benchMap.get(pt.date);
      if (b == null) return { ...pt, benchmark_return: undefined, benchmark_drawdown: undefined, benchmark_mwr: undefined };
      const rebasedReturn = baseGrowth !== 0 ? ((1 + b.return_pct / 100) / baseGrowth - 1) * 100 : 0;
      const growth = 1 + rebasedReturn / 100;
      benchPeak = Math.max(benchPeak, growth);
      const rebasedDd = benchPeak > 0 ? (growth / benchPeak - 1) * 100 : 0;
      return {
        ...pt,
        benchmark_return: rebasedReturn,
        benchmark_drawdown: rebasedDd,
        benchmark_mwr: b.mwr_pct,
      };
    });
  }, [rawTradingData, benchmarkData, benchmarkTicker]);

  const hasBenchmark = !!benchmarkTicker && !!benchmarkData?.length;

  const hasData = tradingData.length > 0;

  // Calculate gradient offset for TWR/MWR split coloring (where 0 falls in the range)
  const calcGradientOffset = (key: keyof PerformancePoint) => {
    if (!hasData) return 0.5;
    const vals = tradingData.map((d) => Number(d[key]));
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (max <= 0) return 0;   // all negative
    if (min >= 0) return 1;   // all positive
    return max / (max - min);
  };

  const twrOffset = calcGradientOffset("time_weighted_return");
  const mwrOffset = calcGradientOffset("money_weighted_return");

  // Detect if data spans multiple calendar years
  const multiYear = hasData &&
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

  const formatPct = (v: number) => v.toFixed(2) + "%";

  const fmtDelta = (d: number) => (d >= 0 ? "+" : "") + formatPct(d);
  const dCol = (d: number) => (d >= 0 ? "#10b981" : "#ef4444");

  // Custom tooltip for TWR/Drawdown modes with overlay delta + prev day delta
  const renderOverlayTooltip = (primaryKey: string, primaryLabel: string, oKey: string | undefined, oLabel: string, benchKey?: string) => {
    const multiLine = (showOverlay && !!oKey) || hasBenchmark;
    return ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const idx = tradingData.findIndex((d) => d.date === label);
      const prev: any = idx > 0 ? tradingData[idx - 1] : null;
      const primaryEntry = payload.find((p: any) => p.dataKey === primaryKey);
      const overlayEntry = payload.find((p: any) => p.dataKey === oKey);
      const benchEntry = benchKey ? payload.find((p: any) => p.dataKey === benchKey) : null;
      const pVal = primaryEntry?.value as number | undefined;
      const oVal = overlayEntry?.value as number | undefined;
      const bVal = benchEntry?.value as number | undefined;
      const hasBoth = pVal != null && oVal != null;
      const delta = hasBoth ? pVal - oVal : null;
      const pPrev = prev ? prev[primaryKey] : null;
      const pDayD = pVal != null && pPrev != null ? Number(pVal) - Number(pPrev) : null;
      const oPrev = prev && oKey ? prev[oKey] : null;
      const oDayD = oVal != null && oPrev != null ? Number(oVal) - Number(oPrev) : null;
      const pDC = pDayD != null ? dCol(pDayD) : "#71717a";
      const oDC = oDayD != null ? dCol(oDayD) : "#71717a";
      const dDC = delta != null ? dCol(delta) : "#71717a";
      return (
        <div key={String(label)} style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, padding: "10px 14px" }}>
          <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{formatDate(String(label))}</p>
          {pVal != null && (
            <div>
              <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>
                {showOverlay && oKey ? "Live" : primaryLabel} : {formatPct(pVal)}
              </p>
              {!multiLine && pDayD != null && (
                <p key={`pd-${pDC}`} style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: pDC }}>Δ to Prev. Day: {fmtDelta(pDayD)}</p>
              )}
            </div>
          )}
          {showOverlay && oVal != null && (
            <div>
              <p style={{ margin: 0, lineHeight: 1.6, color: overlayColor }}>
                {oLabel} : {formatPct(oVal)}
              </p>
            </div>
          )}
          {showOverlay && delta != null && (
            <p key={`dl-${dDC}`} style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: dDC }}>
              Δ : {fmtDelta(delta)}
            </p>
          )}
          {hasBenchmark && bVal != null && (
            <div>
              <p style={{ margin: 0, lineHeight: 1.6, color: BENCH_COLOR }}>
                {benchmarkTicker} : {formatPct(bVal)}
              </p>
            </div>
          )}
          {hasBenchmark && pVal != null && bVal != null && (
            <p style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: (pVal - bVal) >= 0 ? '#10b981' : '#ef4444' }}>
              Δ : {fmtDelta(pVal - bVal)}
            </p>
          )}
        </div>
      );
    };
  };

  // Custom tooltip for Portfolio mode with prev day delta (not on Deposits)
  const renderPortfolioTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const idx = tradingData.findIndex((d) => d.date === label);
    const prev = idx > 0 ? tradingData[idx - 1] : null;
    return (
      <div key={String(label)} style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, padding: "10px 14px" }}>
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{formatDate(String(label))}</p>
        {payload.map((entry: any) => {
          const val = Number(entry.value);
          const isDeposits = entry.dataKey === "net_deposits";
          const name = entry.dataKey === "portfolio_value" ? "Portfolio" : "Deposits";
          const prevVal = prev ? (prev as any)[entry.dataKey] : null;
          const dayD = !isDeposits && prevVal != null && prevVal !== 0 ? ((val - Number(prevVal)) / Number(prevVal)) * 100 : null;
          const dc = dayD != null ? dCol(dayD) : "#71717a";
          return (
            <div key={entry.dataKey}>
              <p style={{ margin: 0, lineHeight: 1.6, color: entry.color || "#e4e4e7" }}>
                {name} : {formatValue(val)}
              </p>
              {dayD != null && (
                <p key={`pfd-${dc}`} style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: dc }}>Δ to Prev. Day: {fmtDelta(dayD)}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Custom tooltip for MWR mode with prev day delta
  const renderMwrTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const idx = tradingData.findIndex((d) => d.date === label);
    const prev = idx > 0 ? tradingData[idx - 1] : null;
    const entry = payload.find((p: any) => p.dataKey === "money_weighted_return");
    const benchEntry = payload.find((p: any) => p.dataKey === "benchmark_mwr");
    const val = entry ? Number(entry.value) : null;
    const bVal = benchEntry?.value as number | undefined;
    const prevVal = prev ? (prev as any).money_weighted_return : null;
    const dayD = val != null && prevVal != null ? val - Number(prevVal) : null;
    const dc = dayD != null ? dCol(dayD) : "#71717a";
    return (
      <div key={String(label)} style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, padding: "10px 14px" }}>
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{formatDate(String(label))}</p>
        {val != null && (
          <>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>MWR : {formatPct(val)}</p>
            {!hasBenchmark && dayD != null && (
              <p key={`md-${dc}`} style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: dc }}>Δ to Prev. Day: {fmtDelta(dayD)}</p>
            )}
          </>
        )}
        {hasBenchmark && bVal != null && (
          <p style={{ margin: 0, lineHeight: 1.6, color: BENCH_COLOR }}>
            {benchmarkTicker} : {formatPct(bVal)}
          </p>
        )}
        {hasBenchmark && val != null && bVal != null && (
          <p style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: (val - bVal) >= 0 ? '#10b981' : '#ef4444' }}>
            Δ : {fmtDelta(val - bVal)}
          </p>
        )}
      </div>
    );
  };

  const isCustomRange = startDate !== "" || endDate !== "";
  const displayStart = startDate || (hasData ? tradingData[0].date : "");
  const displayEnd = endDate || (hasData ? tradingData[tradingData.length - 1].date : "");

  return (
    <Card className="border-border/50">
      <CardContent className="pt-6">
        {/* Controls row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Chart mode toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => setMode("portfolio")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "portfolio"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {portfolioLabel || "Portfolio Value"}
            </button>
            <button
              onClick={() => setMode("twr")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "twr"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              TWR
            </button>
            {!hideMWR && (
              <button
                onClick={() => setMode("mwr")}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "mwr"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                MWR
              </button>
            )}
            <button
              onClick={() => setMode("drawdown")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "drawdown"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Drawdown
            </button>
          </div>

          {!hidePeriodControls && (
            <>
              <div className="h-5 w-px bg-border/50" />

              {/* Period pills */}
              <div className="flex rounded-lg bg-muted p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      onPeriodChange(p);
                      onStartDateChange("");
                      onEndDateChange("");
                    }}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === p && !isCustomRange
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="h-5 w-px bg-border/50" />

              {/* Date pickers */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={displayStart}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
                />
                <span className="text-muted-foreground">to</span>
                <input
                  type="date"
                  value={displayEnd}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
                />
                {isCustomRange && (
                  <button
                    onClick={() => {
                      onStartDateChange("");
                      onEndDateChange("");
                    }}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Chart */}
        {!hasData ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No data for the selected date range
          </div>
        ) : mode === "portfolio" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatValue}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={renderPortfolioTooltip} />
              {showDeposits && (
                <Area
                  type="monotone"
                  dataKey="net_deposits"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  fill="url(#depGrad)"
                  dot={false}
                />
              )}
              {showPortfolio && (
                <Area
                  type="monotone"
                  dataKey="portfolio_value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#pvGrad)"
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : mode === "twr" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="twrGradSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset={twrOffset} stopColor="#10b981" stopOpacity={0.05} />
                  <stop offset={twrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="twrStrokeSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={twrOffset} stopColor="#10b981" />
                  <stop offset={twrOffset} stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatPct}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip content={renderOverlayTooltip("time_weighted_return", "TWR", overlayKey, overlayLabel || "Backtest", "benchmark_return")} />
              <Area
                type="monotone"
                dataKey="time_weighted_return"
                stroke="url(#twrStrokeSplit)"
                strokeWidth={2}
                fill="url(#twrGradSplit)"
                dot={false}
              />
              {overlayKey && showOverlay && (
                <Line
                  type="monotone"
                  dataKey={overlayKey}
                  stroke={overlayColor}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />
              )}
              {hasBenchmark && (
                <Line type="monotone" dataKey="benchmark_return" stroke={BENCH_COLOR} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : mode === "mwr" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="mwrGradSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#d946ef" stopOpacity={0.3} />
                  <stop offset={mwrOffset} stopColor="#d946ef" stopOpacity={0.05} />
                  <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="mwrStrokeSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={mwrOffset} stopColor="#d946ef" />
                  <stop offset={mwrOffset} stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatPct}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip content={renderMwrTooltip} />
              <Area
                type="monotone"
                dataKey="money_weighted_return"
                stroke="url(#mwrStrokeSplit)"
                strokeWidth={2}
                fill="url(#mwrGradSplit)"
                dot={false}
              />
              {hasBenchmark && (
                <Line type="monotone" dataKey="benchmark_mwr" stroke={BENCH_COLOR} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={tradingData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={formatPct}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip content={renderOverlayTooltip("current_drawdown", "Drawdown", drawdownOverlayKey, overlayLabel || "Backtest", "benchmark_drawdown")} />
              <Area
                type="monotone"
                dataKey="current_drawdown"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#ddGrad)"
                baseValue={0}
                dot={false}
              />
              {drawdownOverlayKey && showOverlay && (
                <Line
                  type="monotone"
                  dataKey={drawdownOverlayKey}
                  stroke={overlayColor}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />
              )}
              {hasBenchmark && (
                <Line type="monotone" dataKey="benchmark_drawdown" stroke={BENCH_COLOR} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Portfolio/Deposits legend below chart */}
        {(mode === "twr" || mode === "drawdown") && hasData && onOverlayToggle && (overlayKey || drawdownOverlayKey) && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium cursor-default ${
                mode === "drawdown" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: mode === "drawdown" ? "#ef4444" : "#10b981" }} />
              Live
            </button>
            <button
              onClick={() => onOverlayToggle(!showOverlay)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showOverlay ? "text-indigo-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showOverlay ? overlayColor : "#71717a" }} />
              {overlayLabel || "Overlay"}
            </button>
          </div>
        )}
        {mode === "portfolio" && hasData && (
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              onClick={() => { if (showDeposits) setShowPortfolio(!showPortfolio); }}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showPortfolio ? "text-emerald-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showPortfolio ? "#10b981" : "#71717a" }} />
              Portfolio
            </button>
            <button
              onClick={() => { if (showPortfolio) setShowDeposits(!showDeposits); }}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                showDeposits ? "text-indigo-400" : "text-muted-foreground/40 line-through"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showDeposits ? "#6366f1" : "#71717a" }} />
              Deposits
            </button>
          </div>
        )}

        {/* Benchmark toggle row — hidden in Portfolio mode */}
        {mode !== "portfolio" && hasData && onBenchmarkChange && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="text-[11px] text-muted-foreground mr-1">Benchmark:</span>
            {["SPY", "QQQ", "TQQQ"].map((t) => (
              <button
                key={t}
                onClick={() => onBenchmarkChange(benchmarkTicker === t ? null : t)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  benchmarkTicker === t
                    ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40"
                    : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
                }`}
              >
                {t}
              </button>
            ))}
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
              >
                +
              </button>
            ) : (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = customTickerInput.trim().toUpperCase();
                  if (t) {
                    onBenchmarkChange(t);
                    setCustomTickerInput("");
                    setShowCustomInput(false);
                  }
                }}
              >
                <input
                  autoFocus
                  value={customTickerInput}
                  onChange={(e) => setCustomTickerInput(e.target.value)}
                  placeholder="TICKER"
                  className="w-20 rounded-md border border-border/50 bg-muted px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
                  onBlur={() => { if (!customTickerInput.trim()) setShowCustomInput(false); }}
                />
                <button type="submit" className="cursor-pointer rounded-md bg-orange-500/20 px-2 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30">Go</button>
              </form>
            )}
            {benchmarkTicker && !["SPY", "QQQ", "TQQQ"].includes(benchmarkTicker) && (
              <button
                onClick={() => onBenchmarkChange(null)}
                className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40"
              >
                {benchmarkTicker} ✕
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
