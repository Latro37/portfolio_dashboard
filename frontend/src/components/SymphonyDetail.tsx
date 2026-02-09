"use client";

import { useEffect, useState, useMemo } from "react";
import { X, RefreshCw } from "lucide-react";
import {
  api,
  SymphonyInfo,
  PerformancePoint,
  SymphonyBacktest,
  SymphonySummary,
  SymphonyTradePreview,
} from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { PerformanceChart, ChartMode } from "./PerformanceChart";
import { InfoTooltip, TWR_TOOLTIP_TEXT } from "./InfoTooltip";

interface Props {
  symphony: SymphonyInfo;
  onClose: () => void;
}

type Tab = "live" | "backtest";

// --- helpers ---
function fmtDollar(v: number): string {
  return "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSignedDollar(v: number): string {
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
function colorVal(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-muted-foreground";
}
function makeDateFormatter(data: { date: string }[]) {
  const multiYear = data.length > 1 &&
    new Date(data[0].date + "T00:00:00").getFullYear() !==
    new Date(data[data.length - 1].date + "T00:00:00").getFullYear();
  return (d: string) => {
    const dt = new Date(d + "T00:00:00");
    if (multiYear) {
      const yr = String(dt.getFullYear()).slice(-2);
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " '" + yr;
    }
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}
function formatValue(v: number): string {
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function formatPctAxis(v: number): string {
  return v.toFixed(2) + "%";
}

// Convert epoch day number to date string
function epochDayToDate(dayNum: number): string {
  const ms = dayNum * 86400 * 1000;
  const dt = new Date(ms);
  return dt.toISOString().slice(0, 10);
}

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 8,
  fontSize: 13,
};

// --- Metric card ---
function Metric({ label, value, color, subValue, tooltip, valueTooltip, subValueColor, subValueTooltip, subValueLarge }: { label: string; value: string; color?: string; subValue?: string; tooltip?: string; valueTooltip?: string; subValueColor?: string; subValueTooltip?: string; subValueLarge?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums flex items-center gap-1 ${color || "text-foreground"}`}>
        {value}
        {valueTooltip && <InfoTooltip text={valueTooltip} />}
      </div>
      {subValue && (
        <div className={`${subValueLarge ? "mt-0.5 text-lg font-semibold" : "text-xs"} tabular-nums flex items-center gap-1 ${subValueColor || color || "text-muted-foreground"}`}>
          {subValue}
          {subValueTooltip && <InfoTooltip text={subValueTooltip} />}
        </div>
      )}
    </div>
  );
}

type Period = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

function isWeekday(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00").getDay();
  return day !== 0 && day !== 6; // 0=Sun, 6=Sat
}

function periodStartDate(period: Period): string {
  const now = new Date();
  switch (period) {
    case "1D": { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
    case "1W": { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
    case "1M": { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
    case "3M": { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); }
    case "YTD": return `${now.getFullYear()}-01-01`;
    case "1Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
    case "ALL": return "";
  }
}

export function SymphonyDetail({ symphony, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [chartMode, setChartMode] = useState<ChartMode>("portfolio");
  const [liveData, setLiveData] = useState<PerformancePoint[]>([]);
  const [backtest, setBacktest] = useState<SymphonyBacktest | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [liveAllocations, setLiveAllocations] = useState<Record<string, Record<string, number>>>({});
  const [tradePreview, setTradePreview] = useState<SymphonyTradePreview | null>(null);
  const [loadingTradePreview, setLoadingTradePreview] = useState(false);
  const [tradePreviewRefreshedAt, setTradePreviewRefreshedAt] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [liveSummary, setLiveSummary] = useState<SymphonySummary | null>(null);

  const s = symphony;

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Fetch live performance on mount
  useEffect(() => {
    setLoadingLive(true);
    api
      .getSymphonyPerformance(s.id, s.account_id)
      .then(setLiveData)
      .catch(() => setLiveData([]))
      .finally(() => setLoadingLive(false));
  }, [s.id, s.account_id]);

  // Fetch backtest eagerly on mount
  useEffect(() => {
    setLoadingBacktest(true);
    api
      .getSymphonyBacktest(s.id, s.account_id)
      .then(setBacktest)
      .catch(() => setBacktest(null))
      .finally(() => setLoadingBacktest(false));
  }, [s.id, s.account_id]);

  // Fetch live allocation history
  useEffect(() => {
    api
      .getSymphonyAllocations(s.id, s.account_id)
      .then(setLiveAllocations)
      .catch(() => setLiveAllocations({}));
  }, [s.id, s.account_id]);

  // Fetch trade preview
  const fetchTradePreview = () => {
    setLoadingTradePreview(true);
    api
      .getSymphonyTradePreview(s.id, s.account_id)
      .then((data) => {
        setTradePreview(data);
        setTradePreviewRefreshedAt(new Date());
      })
      .catch(() => setTradePreview(null))
      .finally(() => setLoadingTradePreview(false));
  };

  useEffect(() => {
    fetchTradePreview();
  }, [s.id, s.account_id]);

  // Fetch live summary metrics from backend (period-aware or custom date range)
  useEffect(() => {
    if (customStart || customEnd) {
      // Custom date range — pass explicit start/end dates
      api
        .getSymphonySummary(s.id, s.account_id, undefined, customStart || undefined, customEnd || undefined)
        .then(setLiveSummary)
        .catch(() => setLiveSummary(null));
    } else {
      // Preset period
      const p = period === "ALL" ? undefined : period;
      api
        .getSymphonySummary(s.id, s.account_id, p)
        .then(setLiveSummary)
        .catch(() => setLiveSummary(null));
    }
  }, [s.id, s.account_id, period, customStart, customEnd]);

  // Filter live data by period/custom dates (client-side, data already fetched as ALL)
  const filteredLiveData = useMemo(() => {
    if (!liveData.length) return [];
    const start = customStart || periodStartDate(period);
    const end = customEnd || "";
    if (!start && !end) return liveData.filter((pt) => isWeekday(pt.date));
    return liveData.filter((pt) => {
      if (!isWeekday(pt.date)) return false;
      if (start && pt.date < start) return false;
      if (end && pt.date > end) return false;
      return true;
    });
  }, [liveData, period, customStart, customEnd]);

  // Compute backtest chart data
  const backtestChartData = useMemo(() => {
    if (!backtest) return [];
    const dvm = backtest.dvm_capital;
    // dvm_capital is {symphony_id: {day_number: value}}
    const symKeys = Object.keys(dvm);
    if (!symKeys.length) return [];
    const series = dvm[symKeys[0]];
    const dayNums = Object.keys(series).map(Number).sort((a, b) => a - b);
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

  // TWR gradient offset helper
  const calcTwrOffset = (data: { twr: number }[]) => {
    if (!data.length) return 0.5;
    const vals = data.map((d) => d.twr);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  };

  // Filter backtest data by period/custom dates (client-side)
  const filteredBacktestData = useMemo(() => {
    if (!backtestChartData.length) return [];
    const start = customStart || periodStartDate(period);
    const end = customEnd || "";
    if (!start && !end) return backtestChartData.filter((pt) => isWeekday(pt.date));
    const filtered = backtestChartData.filter((pt) => {
      if (!isWeekday(pt.date)) return false;
      if (start && pt.date < start) return false;
      if (end && pt.date > end) return false;
      return true;
    });
    // Recompute TWR and drawdown relative to the filtered window
    if (!filtered.length) return [];
    let twr = 1;
    let peak = filtered[0].value;
    return filtered.map((pt, i) => {
      if (i > 0) {
        const prev = filtered[i - 1].value;
        const dailyRet = prev > 0 ? (pt.value - prev) / prev : 0;
        twr *= 1 + dailyRet;
      }
      peak = Math.max(peak, pt.value);
      return {
        ...pt,
        twr: (twr - 1) * 100,
        drawdown: peak > 0 ? ((pt.value - peak) / peak) * 100 : 0,
      };
    });
  }, [backtestChartData, period, customStart, customEnd]);

  const backtestTwrOffset = calcTwrOffset(filteredBacktestData);
  const btFormatDate = makeDateFormatter(filteredBacktestData);

  // Live metrics: values from backend /summary, date lookups from client-side data
  const liveMetrics = useMemo(() => {
    const empty = { sharpe: null as number | null, maxDrawdown: null as number | null, maxDrawdownDate: "", annualized: null as number | null, calmar: null as number | null, winRate: null as number | null, bestDay: null as number | null, worstDay: null as number | null, bestDayDate: "", worstDayDate: "", cumReturn: null as number | null, twr: null as number | null, totalReturn: null as number | null, startDate: "", endDate: "" };
    if (!liveSummary) return empty;

    // Date lookups from client-side data (backend doesn't track which date has best/worst)
    let bestDayDate = "", worstDayDate = "", maxDrawdownDate = "";
    if (filteredLiveData.length >= 2) {
      const pts = filteredLiveData.slice(1);
      let bestDay = -Infinity, worstDay = Infinity;
      for (const pt of pts) {
        if (pt.daily_return_pct > bestDay) { bestDay = pt.daily_return_pct; bestDayDate = pt.date; }
        if (pt.daily_return_pct < worstDay) { worstDay = pt.daily_return_pct; worstDayDate = pt.date; }
      }
      // Find date of max drawdown using deposit-adjusted equity curve (TWR)
      let equity = 1;
      let eqPeak = 1;
      let maxDd = 0;
      for (let j = 0; j < filteredLiveData.length; j++) {
        if (j > 0) {
          const r = filteredLiveData[j].daily_return_pct / 100;
          equity *= (1 + r);
        }
        if (equity > eqPeak) eqPeak = equity;
        const dd = eqPeak > 0 ? (equity / eqPeak - 1) : 0;
        if (dd < maxDd) { maxDd = dd; maxDrawdownDate = filteredLiveData[j].date; }
      }
    }

    return {
      sharpe: liveSummary.sharpe_ratio,
      maxDrawdown: liveSummary.max_drawdown,
      maxDrawdownDate,
      annualized: liveSummary.annualized_return,
      calmar: liveSummary.calmar_ratio,
      winRate: liveSummary.win_rate,
      bestDay: liveSummary.best_day_pct,
      worstDay: liveSummary.worst_day_pct,
      bestDayDate,
      worstDayDate,
      cumReturn: liveSummary.cumulative_return_pct,
      twr: liveSummary.time_weighted_return,
      totalReturn: liveSummary.total_return_dollars,
      startDate: liveSummary.start_date,
      endDate: liveSummary.end_date,
    };
  }, [liveSummary, filteredLiveData]);

  // Backtest metrics: use backend summary_metrics for ALL period, client-side for filtered
  const btMetrics = useMemo(() => {
    const empty = { cumReturn: null as number | null, annualized: null as number | null, sharpe: null as number | null, sortino: null as number | null, calmar: null as number | null, maxDrawdown: null as number | null, winRate: null as number | null, stdDev: null as number | null, startDate: "", endDate: "" };
    if (filteredBacktestData.length < 2) return empty;
    const first = filteredBacktestData[0];
    const last = filteredBacktestData[filteredBacktestData.length - 1];
    const startDate = first.date;
    const endDate = last.date;

    // Use pre-computed backend metrics for ALL period
    const sm = backtest?.summary_metrics;
    if (sm && period === "ALL" && !customStart && !customEnd) {
      return {
        cumReturn: sm.cumulative_return_pct / 100,
        annualized: sm.annualized_return / 100,
        sharpe: sm.sharpe_ratio,
        sortino: sm.sortino_ratio,
        calmar: sm.calmar_ratio,
        maxDrawdown: sm.max_drawdown / 100,
        winRate: sm.win_rate / 100,
        stdDev: sm.annualized_volatility / 100,
        startDate,
        endDate,
      };
    }

    // Client-side computation for filtered periods
    const dailyReturns = filteredBacktestData.slice(1).map((pt, i) => {
      const prev = filteredBacktestData[i].value;
      return prev > 0 ? ((pt.value - prev) / prev) * 100 : 0;
    });
    const n = dailyReturns.length;
    if (n === 0) return empty;
    const twrStart = 1 + (first.twr ?? 0) / 100;
    const twrEnd = 1 + (last.twr ?? 0) / 100;
    const cumReturn = twrStart > 0 ? (twrEnd / twrStart - 1) : 0;
    const annualized = n > 0 ? Math.pow(1 + cumReturn, 252 / n) - 1 : 0;
    const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / n;
    const variance = dailyReturns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : null;
    const downsideReturns = dailyReturns.filter((r) => r < 0);
    const downsideVar = downsideReturns.length > 0 ? downsideReturns.reduce((a, r) => a + r ** 2, 0) / n : 0;
    const downsideDev = Math.sqrt(downsideVar);
    const sortino = downsideDev > 0 ? (meanRet / downsideDev) * Math.sqrt(252) : null;
    let peak = first.value;
    let maxDd = 0;
    for (const pt of filteredBacktestData) {
      if (pt.value > peak) peak = pt.value;
      const dd = peak > 0 ? (pt.value - peak) / peak : 0;
      if (dd < maxDd) maxDd = dd;
    }
    const calmar = maxDd < 0 ? annualized / Math.abs(maxDd) : null;
    const wins = dailyReturns.filter((r) => r > 0).length;
    const winRate = wins / n;
    return { cumReturn, annualized, sharpe, sortino, calmar, maxDrawdown: maxDd, winRate, stdDev: stdDev / 100, startDate, endDate };
  }, [filteredBacktestData, backtest, period, customStart, customEnd]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 my-8 w-full max-w-7xl rounded-2xl border border-border bg-background shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3.5 w-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <h2 className="text-xl font-bold">{s.name}</h2>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Invested since {s.invested_since}</span>
              {s.rebalance_frequency && <span>Rebalance: {s.rebalance_frequency}</span>}
              {s.last_rebalance_on && <span>Last rebalance: {new Date(s.last_rebalance_on).toLocaleDateString()}</span>}
              <span className="text-muted-foreground/60">{s.account_name}</span>
            </div>
          </div>

          {/* Live Metrics */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Live Metrics
              {liveMetrics.startDate && liveMetrics.endDate && (
                <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">
                  {new Date(liveMetrics.startDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" — "}
                  {new Date(liveMetrics.endDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Current Value" value={fmtDollar(s.value)} />
              <Metric label="Net Deposits" value={fmtDollar(s.net_deposits)} />
              <Metric
                label="Today's Change"
                value={fmtPct(s.last_percent_change)}
                color={colorVal(s.last_percent_change)}
                subValue={fmtSignedDollar(s.last_dollar_change)}
              />
              <Metric label="Profit" value={liveMetrics.totalReturn != null ? fmtSignedDollar(liveMetrics.totalReturn) : "—"} color={colorVal(liveMetrics.totalReturn ?? 0)} />
              <Metric label="Cum. Return" value={liveMetrics.cumReturn != null ? fmtPct(liveMetrics.cumReturn) : "—"} color={colorVal(liveMetrics.cumReturn ?? 0)} />
              <Metric
                label="TWR"
                value={liveMetrics.twr != null ? fmtPct(liveMetrics.twr) : "—"}
                color={liveMetrics.twr != null ? colorVal(liveMetrics.twr) : "text-muted-foreground"}
                tooltip={TWR_TOOLTIP_TEXT}
              />
              <Metric label="Sharpe" value={liveMetrics.sharpe != null ? liveMetrics.sharpe.toFixed(2) : "—"} />
              <Metric label="Max Drawdown" value={liveMetrics.maxDrawdown != null ? fmtPct(liveMetrics.maxDrawdown) : "—"} color="text-red-400" valueTooltip={liveMetrics.maxDrawdownDate ? new Date(liveMetrics.maxDrawdownDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined} />
              <Metric label="Annualized" value={liveMetrics.annualized != null ? fmtPct(liveMetrics.annualized) : "—"} color={colorVal(liveMetrics.annualized ?? 0)} />
              <Metric label="Calmar" value={liveMetrics.calmar != null ? liveMetrics.calmar.toFixed(2) : "—"} />
              <Metric label="Win Rate" value={liveMetrics.winRate != null ? liveMetrics.winRate.toFixed(1) + "%" : "—"} />
              <Metric
                label="Best / Worst Day"
                value={liveMetrics.bestDay != null ? fmtPct(liveMetrics.bestDay) : "—"}
                color="text-emerald-400"
                valueTooltip={liveMetrics.bestDayDate ? new Date(liveMetrics.bestDayDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined}
                subValue={liveMetrics.worstDay != null ? fmtPct(liveMetrics.worstDay) : "—"}
                subValueLarge
                subValueColor="text-red-400"
                subValueTooltip={liveMetrics.worstDayDate ? new Date(liveMetrics.worstDayDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined}
              />
            </div>
          </div>

          {/* Tabs: Live / Backtest */}
          <div className="flex rounded-lg bg-muted p-0.5 w-fit">
            <button
              onClick={() => setTab("live")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === "live" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Live Performance
            </button>
            <button
              onClick={() => setTab("backtest")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === "backtest" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Backtest
            </button>
          </div>

          {/* Chart area */}
          {tab === "live" ? (
            loadingLive ? (
              <div className="flex h-[320px] items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PerformanceChart
                data={filteredLiveData}
                period={period}
                onPeriodChange={(p) => setPeriod(p as Period)}
                startDate={customStart}
                endDate={customEnd}
                onStartDateChange={setCustomStart}
                onEndDateChange={setCustomEnd}
                portfolioLabel="Symphony Value"
                chartMode={chartMode}
                onChartModeChange={setChartMode}
              />
            )
          ) : (
            <div>
              {/* Backtest controls row */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {/* Chart mode toggle */}
                <div className="flex rounded-lg bg-muted p-0.5">
                  {(["portfolio", "twr", "drawdown"] as ChartMode[]).map((m) => {
                    const active = chartMode === m || (m === "portfolio" && (chartMode === "portfolio" || chartMode === "mwr"));
                    return (
                      <button
                        key={m}
                        onClick={() => setChartMode(m)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "portfolio" ? "Symphony Value" : m === "twr" ? "TWR" : "Drawdown"}
                      </button>
                    );
                  })}
                </div>

                <div className="h-5 w-px bg-border/50" />

                {/* Period pills */}
                <div className="flex rounded-lg bg-muted p-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setCustomStart(""); setCustomEnd(""); }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        period === p && !customStart && !customEnd
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
                  <input type="date" value={customStart || (filteredBacktestData.length ? filteredBacktestData[0].date : "")} onChange={(e) => setCustomStart(e.target.value)} className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30" />
                  <span className="text-muted-foreground">to</span>
                  <input type="date" value={customEnd || (filteredBacktestData.length ? filteredBacktestData[filteredBacktestData.length - 1].date : "")} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30" />
                  {(customStart || customEnd) && (
                    <button onClick={() => { setCustomStart(""); setCustomEnd(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                  )}
                </div>
              </div>

              {loadingBacktest ? (
                <div className="flex h-[280px] items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredBacktestData.length ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  No backtest data available
                </div>
              ) : (chartMode === "portfolio" || chartMode === "mwr") ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={filteredBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <defs>
                      <linearGradient id="btValGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={btFormatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tickFormatter={formatValue} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l: any) => btFormatDate(String(l))} formatter={(v: any) => [formatValue(Number(v)), "Backtest Value"]} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#btValGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : chartMode === "twr" ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={filteredBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <defs>
                      <linearGradient id="btTwrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={0} stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset={backtestTwrOffset} stopColor="#10b981" stopOpacity={0.05} />
                        <stop offset={backtestTwrOffset} stopColor="#ef4444" stopOpacity={0.15} />
                        <stop offset={1} stopColor="#ef4444" stopOpacity={0.3} />
                      </linearGradient>
                      <linearGradient id="btTwrStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={backtestTwrOffset} stopColor="#10b981" />
                        <stop offset={backtestTwrOffset} stopColor="#ef4444" />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={btFormatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l: any) => btFormatDate(String(l))} formatter={(v: any) => [formatPctAxis(Number(v)), "TWR"]} />
                    <Area type="monotone" dataKey="twr" stroke="url(#btTwrStroke)" strokeWidth={2} fill="url(#btTwrGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={filteredBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <defs>
                      <linearGradient id="btDdGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={btFormatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l: any) => btFormatDate(String(l))} formatter={(v: any) => [formatPctAxis(Number(v)), "Drawdown"]} />
                    <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#btDdGrad)" baseValue={0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {/* Backtest stats summary */}
              {filteredBacktestData.length >= 2 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Backtest Metrics
                    {btMetrics.startDate && btMetrics.endDate && (
                      <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">
                        {new Date(btMetrics.startDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {" — "}
                        {new Date(btMetrics.endDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 text-xs">
                    {btMetrics.cumReturn != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Cum. Return</span>
                        <span className={`ml-1 font-medium ${colorVal(btMetrics.cumReturn)}`}>{(btMetrics.cumReturn * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    {btMetrics.annualized != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Annualized</span>
                        <span className={`ml-1 font-medium ${colorVal(btMetrics.annualized)}`}>{(btMetrics.annualized * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    {btMetrics.sharpe != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Sharpe</span>
                        <span className="ml-1 font-medium">{btMetrics.sharpe.toFixed(2)}</span>
                      </div>
                    )}
                    {btMetrics.sortino != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Sortino</span>
                        <span className="ml-1 font-medium">{btMetrics.sortino.toFixed(2)}</span>
                      </div>
                    )}
                    {btMetrics.calmar != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Calmar</span>
                        <span className="ml-1 font-medium">{btMetrics.calmar.toFixed(2)}</span>
                      </div>
                    )}
                    {btMetrics.maxDrawdown != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Max DD</span>
                        <span className="ml-1 font-medium text-red-400">{(btMetrics.maxDrawdown * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    {btMetrics.winRate != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Win Rate</span>
                        <span className="ml-1 font-medium">{(btMetrics.winRate * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {btMetrics.stdDev != null && (
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <span className="text-muted-foreground">Std Dev</span>
                        <span className="ml-1 font-medium">{(btMetrics.stdDev * 100).toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Holdings — Live */}
          {tab === "live" && s.holdings.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Current Holdings (Live)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="pb-2 pr-3 font-medium">Ticker</th>
                      <th className="pb-2 pr-3 font-medium text-right">Allocation</th>
                      <th className="pb-2 pr-3 font-medium text-right">Value</th>
                      <th className="pb-2 font-medium text-right">Today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.holdings.map((h) => (
                      <tr key={h.ticker} className="border-b border-border/30">
                        <td className="py-2 pr-3 font-medium">{h.ticker}</td>
                        <td className="py-2 pr-3 text-right">{h.allocation.toFixed(1)}%</td>
                        <td className="py-2 pr-3 text-right">{fmtDollar(h.value)}</td>
                        <td className={`py-2 text-right ${colorVal(h.last_percent_change)}`}>
                          {fmtPct(h.last_percent_change)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Current Holdings — Backtest (latest allocation from tdvm_weights) */}
          {tab === "backtest" && backtest && (() => {
            const w = backtest.tdvm_weights;
            const entries = Object.entries(w);
            if (!entries.length) return null;
            // Find the latest day number across all tickers
            let maxDay = -Infinity;
            for (const [, dayMap] of entries) {
              for (const d of Object.keys(dayMap)) {
                const n = Number(d);
                if (n > maxDay) maxDay = n;
              }
            }
            // Collect allocations at the latest day
            const holdings = entries
              .map(([ticker, dayMap]) => ({ ticker, allocation: (dayMap[String(maxDay)] ?? 0) * 100 }))
              .filter((h) => h.allocation > 0)
              .sort((a, b) => b.allocation - a.allocation);
            if (!holdings.length) return null;
            return (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Latest Holdings (Backtest)
                  <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">{epochDayToDate(maxDay)}</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="pb-2 pr-3 font-medium">Ticker</th>
                        <th className="pb-2 font-medium text-right">Allocation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => (
                        <tr key={h.ticker} className="border-b border-border/30">
                          <td className="py-2 pr-3 font-medium">{h.ticker}</td>
                          <td className="py-2 text-right">{h.allocation.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Trade Preview */}
          {tab === "live" && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Next Automated Trade Preview
                </h3>
                <div className="flex items-center gap-3">
                  {tradePreviewRefreshedAt && (
                    <span className="text-xs text-muted-foreground">
                      {tradePreviewRefreshedAt.toLocaleTimeString()}
                    </span>
                  )}
                  <button
                    onClick={fetchTradePreview}
                    disabled={loadingTradePreview}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    title="Refresh trade preview"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingTradePreview ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              {loadingTradePreview && !tradePreview && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading preview…
                </div>
              )}
              {!loadingTradePreview && (!tradePreview || tradePreview.recommended_trades.length === 0) && (
                <p className="text-sm text-muted-foreground">No upcoming trades.</p>
              )}
              {tradePreview && tradePreview.recommended_trades.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="pb-2 pr-3 font-medium">Ticker</th>
                        <th className="pb-2 pr-3 font-medium">Side</th>
                        <th className="pb-2 pr-3 font-medium text-right">Shares</th>
                        <th className="pb-2 pr-3 font-medium text-right">Est. Value</th>
                        <th className="pb-2 pr-3 font-medium text-right">Price</th>
                        <th className="pb-2 font-medium text-right">Weight Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradePreview.recommended_trades.map((t, i) => (
                        <tr key={`${t.ticker}-${t.side}-${i}`} className="border-b border-border/30">
                          <td className="py-2 pr-3 font-medium">
                            {t.ticker}
                            {t.name && <span className="ml-1.5 text-xs text-muted-foreground">{t.name}</span>}
                          </td>
                          <td className={`py-2 pr-3 font-semibold ${t.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.side}
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            {Math.abs(t.share_change).toFixed(2)}
                          </td>
                          <td className={`py-2 pr-3 text-right whitespace-nowrap ${t.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                            ${Math.abs(t.cash_change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">
                            ${t.average_price.toFixed(2)}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap text-muted-foreground">
                            {t.prev_weight.toFixed(1)}% → {t.next_weight.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Historical Allocations — live (from daily sync snapshots) */}
          {tab === "live" && Object.keys(liveAllocations).length > 0 && (
            <HistoricalAllocations tdvmWeights={liveAllocations} label="Historical Allocations (Live)" isLive />
          )}

          {/* Historical Allocations — backtest (from backtest tdvm_weights) */}
          {tab === "backtest" && backtest && Object.keys(backtest.tdvm_weights).length > 0 && (
            <HistoricalAllocations tdvmWeights={backtest.tdvm_weights} label="Historical Allocations (Backtest)" />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Historical Allocations sub-component ---
// Supports two data formats:
//   backtest (default): tdvmWeights = {ticker: {day_num: weight_0to1}}
//   live:               tdvmWeights = {date_str: {ticker: pct_0to100}}
function HistoricalAllocations({ tdvmWeights, label, isLive }: { tdvmWeights: Record<string, Record<string, number>>; label?: string; isLive?: boolean }) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Normalize into rows: [{dateStr, allocations: {ticker: pct}}]
  const { rows, tickers } = useMemo(() => {
    const tickerSet = new Set<string>();

    if (isLive) {
      // Live format: {date_str: {ticker: pct_0to100}}
      const dateKeys = Object.keys(tdvmWeights).sort().reverse(); // newest first
      const rowList = dateKeys.map((ds) => {
        const allocs = tdvmWeights[ds];
        for (const t of Object.keys(allocs)) tickerSet.add(t);
        return { dateStr: ds, allocations: allocs };
      });
      return { rows: rowList, tickers: Array.from(tickerSet).sort() };
    }

    // Backtest format: {ticker: {day_num: weight_0to1}}
    const daySet = new Set<string>();
    for (const [ticker, dayMap] of Object.entries(tdvmWeights)) {
      tickerSet.add(ticker);
      for (const day of Object.keys(dayMap)) daySet.add(day);
    }
    const sortedDays = Array.from(daySet).map(Number).sort((a, b) => b - a);
    const rowList = sortedDays.map((d) => {
      const allocs: Record<string, number> = {};
      for (const [ticker, dayMap] of Object.entries(tdvmWeights)) {
        const w = dayMap[String(d)];
        if (w != null) allocs[ticker] = w * 100;
      }
      return { dateStr: epochDayToDate(d), allocations: allocs };
    });
    return { rows: rowList, tickers: Array.from(tickerSet).sort() };
  }, [tdvmWeights, isLive]);

  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!rows.length || !tickers.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {label || "Historical Allocations"}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 pr-3 font-medium sticky left-0 bg-background">Date</th>
              {tickers.map((t) => (
                <th key={t} className="pb-2 px-2 font-medium text-right">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ dateStr, allocations }) => (
              <tr key={dateStr} className="border-b border-border/20">
                <td className="py-1.5 pr-3 font-medium sticky left-0 bg-background whitespace-nowrap">{dateStr}</td>
                {tickers.map((ticker) => {
                  const pct = allocations[ticker];
                  return (
                    <td key={ticker} className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {pct != null ? pct.toFixed(1) + "%" : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded px-2 py-1 bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            className="rounded px-2 py-1 bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
