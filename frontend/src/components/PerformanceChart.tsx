"use client";

import { useState } from "react";
import { PerformancePoint } from "@/lib/api";
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
}: Props) {
  const [internalMode, setInternalMode] = useState<ChartMode>("portfolio");
  const mode = controlledMode ?? internalMode;
  const setMode = onChartModeChange ?? setInternalMode;
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showDeposits, setShowDeposits] = useState(true);

  const hasData = data.length > 0;

  // Calculate gradient offset for TWR/MWR split coloring (where 0 falls in the range)
  const calcGradientOffset = (key: keyof PerformancePoint) => {
    if (!hasData) return 0.5;
    const vals = data.map((d) => Number(d[key]));
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
    new Date(data[0].date + "T00:00:00").getFullYear() !==
    new Date(data[data.length - 1].date + "T00:00:00").getFullYear();

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

  // Custom tooltip for TWR/Drawdown modes with overlay delta
  const renderOverlayTooltip = (primaryKey: string, primaryLabel: string, oKey: string | undefined, oLabel: string) => {
    return ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const primaryEntry = payload.find((p: any) => p.dataKey === primaryKey);
      const overlayEntry = payload.find((p: any) => p.dataKey === oKey);
      const pVal = primaryEntry?.value as number | undefined;
      const oVal = overlayEntry?.value as number | undefined;
      const hasBoth = pVal != null && oVal != null;
      const delta = hasBoth ? pVal - oVal : null;
      return (
        <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, padding: "10px 14px", margin: 0 }}>
          <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{formatDate(String(label))}</p>
          {pVal != null && (
            <p style={{ margin: 0, color: primaryEntry?.color || "#e4e4e7", lineHeight: 1.6 }}>
              {showOverlay && oKey ? "Live" : primaryLabel} : {formatPct(pVal)}
            </p>
          )}
          {showOverlay && oVal != null && (
            <p style={{ margin: 0, color: overlayEntry?.color || overlayColor, lineHeight: 1.6 }}>
              {oLabel} : {formatPct(oVal)}
            </p>
          )}
          {showOverlay && delta != null && (
            <p style={{ margin: 0, color: delta >= 0 ? "#10b981" : "#ef4444", lineHeight: 1.6 }}>
              Δ : {delta >= 0 ? "+" : ""}{formatPct(delta)}
            </p>
          )}
        </div>
      );
    };
  };

  const isCustomRange = startDate !== "" || endDate !== "";
  const displayStart = startDate || (hasData ? data[0].date : "");
  const displayEnd = endDate || (hasData ? data[data.length - 1].date : "");

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
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                labelFormatter={(label: any) => formatDate(String(label))}
                formatter={(value: any, name: any) => [
                  formatValue(Number(value)),
                  name === "portfolio_value" ? "Portfolio" : "Deposits",
                ]}
              />
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
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
              <Tooltip content={renderOverlayTooltip("time_weighted_return", "TWR", overlayKey, overlayLabel || "Backtest")} />
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
            </AreaChart>
          </ResponsiveContainer>
        ) : mode === "mwr" ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="mwrGradSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset={mwrOffset} stopColor="#8b5cf6" stopOpacity={0.05} />
                  <stop offset={mwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="mwrStrokeSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={mwrOffset} stopColor="#8b5cf6" />
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
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                labelFormatter={(label: any) => formatDate(String(label))}
                formatter={(value: any) => [formatPct(Number(value)), "MWR"]}
              />
              <Area
                type="monotone"
                dataKey="money_weighted_return"
                stroke="url(#mwrStrokeSplit)"
                strokeWidth={2}
                fill="url(#mwrGradSplit)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
              <Tooltip content={renderOverlayTooltip("current_drawdown", "Drawdown", drawdownOverlayKey, overlayLabel || "Backtest")} />
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
      </CardContent>
    </Card>
  );
}
