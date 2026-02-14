"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
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
import {
  BenchmarkEntry,
  BenchmarkPoint,
  PerformancePoint,
  SymphonyInfo,
} from "@/lib/api";
import { InfoTooltip, TWR_TOOLTIP_TEXT } from "@/components/InfoTooltip";
import { PerformanceChart, ChartMode } from "@/components/PerformanceChart";
import { BacktestMetricsSummary } from "@/features/symphony-detail/components/BacktestMetricsSummary";
import { HistoricalAllocationsTable } from "@/features/symphony-detail/components/HistoricalAllocationsTable";
import { SymphonyBacktestHoldingsSection } from "@/features/symphony-detail/components/SymphonyBacktestHoldingsSection";
import { SymphonyLiveHoldingsSection } from "@/features/symphony-detail/components/SymphonyLiveHoldingsSection";
import { SymphonyTradePreviewSection } from "@/features/symphony-detail/components/SymphonyTradePreviewSection";
import { useSymphonyBenchmarkManager } from "@/features/symphony-detail/hooks/useSymphonyBenchmarkManager";
import { useSymphonyDetailData } from "@/features/symphony-detail/hooks/useSymphonyDetailData";
import {
  SYMPHONY_DETAIL_PERIODS,
  SymphonyDetailPeriod,
  SymphonyDetailTab,
} from "@/features/symphony-detail/types";
import {
  colorVal,
  epochDayToDate,
  fmtDollar,
  fmtPct,
  fmtSignedDollar,
  formatPctAxis,
  isWeekday,
  makeDateFormatter,
  periodStartDate,
  toFiniteNumber,
} from "@/features/symphony-detail/utils";

interface Props {
  symphony: SymphonyInfo;
  onClose: () => void;
  scrollToSection?: "trade-preview";
}

type TooltipEntry = {
  dataKey?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
};

type BacktestChartPoint = {
  date: string;
  value: number;
  twr: number;
  drawdown: number;
  [key: string]: number | string | null | undefined;
};

type LiveChartPoint = PerformancePoint & {
  [key: string]: number | string | null | undefined;
};

// Custom tooltip for backtest chart with overlay delta + prev day delta (backtest is baseline)
const btDCol = (d: number) => (d >= 0 ? "#10b981" : "#ef4444");
const btFmtDelta = (d: number) => (d >= 0 ? "+" : "") + formatPctAxis(d);

function backtestOverlayTooltip(
  primaryKey: string, primaryLabel: string,
  oKey: string, oLabel: string,
  showOverlay: boolean,
  fmtDate: (d: string) => string,
  chartData: BacktestChartPoint[],
  benchSuffix: string,
  activeBenchmarks: BenchmarkEntry[],
) {
  function BacktestOverlayTooltipContent({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length || label == null) return null;

    const labelText = String(label);
    const idx = chartData.findIndex((d) => d.date === labelText);
    const prev = idx > 0 ? chartData[idx - 1] : null;
    const primaryEntry = payload.find((p) => p.dataKey === primaryKey);
    const overlayEntry = payload.find((p) => p.dataKey === oKey);
    const pVal = toFiniteNumber(primaryEntry?.value);
    const oVal = toFiniteNumber(overlayEntry?.value);
    const hasBoth = pVal != null && oVal != null;
    const delta = hasBoth ? pVal - oVal : null;
    const pPrev = prev ? toFiniteNumber(prev[primaryKey]) : null;
    const pDayD = pVal != null && pPrev != null ? pVal - pPrev : null;
    const pDC = pDayD != null ? btDCol(pDayD) : "#71717a";
    const dDC = delta != null ? btDCol(delta) : "#71717a";
    const hasBench = activeBenchmarks.length > 0;
    const singleBench = activeBenchmarks.length === 1;

    return (
      <div key={labelText} style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13, padding: "10px 14px" }}>
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>{fmtDate(labelText)}</p>
        {pVal != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>
              {showOverlay ? "Backtest" : primaryLabel} : {formatPctAxis(pVal)}
            </p>
            {!showOverlay && !hasBench && pDayD != null && (
              <p key={`bpd-${pDC}`} style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: pDC }}>Delta to Prev. Day: {btFmtDelta(pDayD)}</p>
            )}
          </div>
        )}
        {showOverlay && oVal != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#f59e0b" }}>
              {oLabel} : {formatPctAxis(oVal)}
            </p>
          </div>
        )}
        {showOverlay && delta != null && (
          <p key={`bdl-${dDC}`} style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: dDC }}>
            Delta : {btFmtDelta(delta)}
          </p>
        )}
        {activeBenchmarks.map((bench, i) => {
          const bEntry = payload.find((p) => p.dataKey === `bench_${i}_${benchSuffix}`);
          const bVal = toFiniteNumber(bEntry?.value);
          if (bVal == null) return null;
          return (
            <div key={bench.ticker}>
              <p style={{ margin: 0, lineHeight: 1.6, color: bench.color }}>
                {bench.label} : {formatPctAxis(bVal)}
              </p>
              {singleBench && pVal != null && (
                <p style={{ margin: 0, lineHeight: 1.6, marginTop: 2, color: (pVal - bVal) >= 0 ? "#10b981" : "#ef4444" }}>
                  Delta : {btFmtDelta(pVal - bVal)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return BacktestOverlayTooltipContent;
}

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

type Period = SymphonyDetailPeriod;
type Tab = SymphonyDetailTab;

export function SymphonyDetail({ symphony, onClose, scrollToSection }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [chartMode, setChartMode] = useState<ChartMode>("portfolio");
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const tradePreviewRef = useRef<HTMLDivElement>(null);
  const [showBacktestOverlay, setShowBacktestOverlay] = useState(false);
  const [showLiveOverlay, setShowLiveOverlay] = useState(false);
  const {
    liveData,
    backtest,
    liveSummary,
    liveAllocations,
    tradePreview,
    tradePreviewRefreshedAt,
    loadingLive,
    loadingBacktest,
    loadingTradePreview,
    fetchBacktest,
    fetchTradePreview,
  } = useSymphonyDetailData({
    symphony,
    period,
    customStart,
    customEnd,
  });
  const {
    benchmarks,
    customInputVisible,
    customTickerInput,
    catalogDropdownOpen,
    catalogMatches,
    benchmarkDropdownRef,
    maxBenchmarks,
    setCustomInputVisible,
    setCustomTickerInput,
    setCatalogDropdownOpen,
    refreshSymphonyCatalog,
    addBenchmark,
    removeBenchmark,
  } = useSymphonyBenchmarkManager(symphony.account_id);
  const oosDate = useMemo(() => {
    const timestamp = backtest?.last_semantic_update_at;
    return timestamp ? timestamp.slice(0, 10) : "";
  }, [backtest]);
  const s = symphony;
  const isLightColor = (color: string) => color === "#e4e4e7";
  const benchBtnStyle = (color: string) =>
    isLightColor(color)
      ? {
          backgroundColor: color,
          color: "#1a1a1a",
          fontWeight: 700,
          boxShadow: `0 0 0 1px ${color}`,
        }
      : {
          backgroundColor: `${color}20`,
          color,
          boxShadow: `0 0 0 1px ${color}66`,
        };
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  useEffect(() => {
    if (scrollToSection === "trade-preview" && tradePreviewRef.current) {
      tradePreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scrollToSection, tradePreview]);
  const btCustomInput = customInputVisible;
  const btCustomTickerInput = customTickerInput;
  const btCatalogMatches = catalogMatches;
  const btDropdownRef = benchmarkDropdownRef;
  const MAX_BENCHMARKS = maxBenchmarks;
  const handleBenchmarkAdd = addBenchmark;
  const handleBenchmarkRemove = removeBenchmark;
  const setBtCustomInput = setCustomInputVisible;
  const setBtCustomTickerInput = setCustomTickerInput;
  // Filter live data by period/custom dates (client-side, data already fetched as ALL)
  const filteredLiveData = useMemo(() => {
    if (!liveData.length) return [];
    const start = customStart || (period === "OOS" ? oosDate : periodStartDate(period));
    const end = customEnd || "";
    if (!start && !end) return liveData.filter((pt) => isWeekday(pt.date));
    return liveData.filter((pt) => {
      if (!isWeekday(pt.date)) return false;
      if (start && pt.date < start) return false;
      if (end && pt.date > end) return false;
      return true;
    });
  }, [liveData, period, customStart, customEnd, oosDate]);

  // Compute backtest chart data
  const backtestChartData = useMemo<BacktestChartPoint[]>(() => {
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
  const filteredBacktestData = useMemo<BacktestChartPoint[]>(() => {
    if (!backtestChartData.length) return [];
    const start = customStart || (period === "OOS" ? oosDate : periodStartDate(period));
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
  }, [backtestChartData, period, customStart, customEnd, oosDate]);

  const backtestTwrOffset = calcTwrOffset(filteredBacktestData);
  const btFormatDate = makeDateFormatter(filteredBacktestData);

  // Overlay data: merge backtest TWR onto live data and vice versa by date.
  // The overlay is rebased multiplicatively so it starts at 0% on the first
  // overlapping date: rebased = ((1+twr)/(1+baseTwr) - 1) * 100.
  // This ensures both series are on the same scale.
  const mergedLiveData = useMemo<LiveChartPoint[]>(() => {
    if (!filteredLiveData.length) return filteredLiveData as LiveChartPoint[];

    // Rebase live TWR to start at 0% from the first visible date
    const liveBaseFactor = 1 + filteredLiveData[0].time_weighted_return / 100;

    const btByDate: Record<string, number> = {};
    const btDdByDate: Record<string, number> = {};
    for (const pt of filteredBacktestData) {
      btByDate[pt.date] = pt.twr;
      btDdByDate[pt.date] = pt.drawdown;
    }
    // Find the backtest growth factor at the first overlapping live date
    let btBaseFactor: number | null = null;
    for (const pt of filteredLiveData) {
      if (btByDate[pt.date] != null) { btBaseFactor = 1 + btByDate[pt.date] / 100; break; }
    }

    // Compute rebased live drawdown from rebased TWR (tracks peak within visible window)
    let peakGrowth = 1;
    return filteredLiveData.map((pt): LiveChartPoint => {
      const rebasedTwr = liveBaseFactor !== 0
        ? ((1 + pt.time_weighted_return / 100) / liveBaseFactor - 1) * 100
        : pt.time_weighted_return;
      const growth = 1 + rebasedTwr / 100;
      peakGrowth = Math.max(peakGrowth, growth);
      const rebasedDd = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
      return {
        ...pt,
        time_weighted_return: rebasedTwr,
        current_drawdown: rebasedDd,
        backtestTwr: btByDate[pt.date] != null && btBaseFactor != null && btBaseFactor !== 0
          ? ((1 + btByDate[pt.date] / 100) / btBaseFactor - 1) * 100
          : null,
        backtestDrawdown: btDdByDate[pt.date] ?? null,
      };
    });
  }, [filteredLiveData, filteredBacktestData]);

  const mergedBacktestData = useMemo<BacktestChartPoint[]>(() => {
    if (!filteredBacktestData.length) return filteredBacktestData;
    const liveByDate: Record<string, number> = {};
    for (const pt of filteredLiveData) liveByDate[pt.date] = pt.time_weighted_return;
    // Find the live growth factor at the first overlapping backtest date
    let baseFactor: number | null = null;
    for (const pt of filteredBacktestData) {
      if (liveByDate[pt.date] != null) { baseFactor = 1 + liveByDate[pt.date] / 100; break; }
    }

    // Compute live drawdown from rebased live TWR for overlay
    const liveDdByDate: Record<string, number> = {};
    if (baseFactor != null && baseFactor !== 0) {
      let peakGrowth = 1;
      for (const pt of filteredLiveData) {
        const rebasedTwr = ((1 + pt.time_weighted_return / 100) / baseFactor - 1) * 100;
        const growth = 1 + rebasedTwr / 100;
        peakGrowth = Math.max(peakGrowth, growth);
        liveDdByDate[pt.date] = peakGrowth > 0 ? (growth / peakGrowth - 1) * 100 : 0;
      }
    }

    // Merge benchmark data into backtest chart (supports multiple benchmarks)
    const benchStates = benchmarks.filter((b) => b.data.length > 0).map((bench) => {
      const map = new Map(bench.data.map((bp: BenchmarkPoint) => [bp.date, bp]));
      let baseGrowth: number | null = null;
      for (const pt of filteredBacktestData) {
        const bp = map.get(pt.date);
        if (bp != null) { baseGrowth = 1 + bp.return_pct / 100; break; }
      }
      return { map, baseGrowth: baseGrowth ?? 1, peak: 1, lastReturn: undefined as number | undefined, lastDd: undefined as number | undefined };
    });

    return filteredBacktestData.map((pt) => {
      const merged: BacktestChartPoint = {
        ...pt,
        liveTwr: liveByDate[pt.date] != null && baseFactor != null && baseFactor !== 0
          ? ((1 + liveByDate[pt.date] / 100) / baseFactor - 1) * 100
          : null,
        liveDrawdown: liveDdByDate[pt.date] ?? null,
      };
      benchStates.forEach((bs, i) => {
        const bPt = bs.map.get(pt.date);
        if (bPt != null && bs.baseGrowth !== 0) {
          bs.lastReturn = ((1 + bPt.return_pct / 100) / bs.baseGrowth - 1) * 100;
          const growth = 1 + bs.lastReturn / 100;
          bs.peak = Math.max(bs.peak, growth);
          bs.lastDd = bs.peak > 0 ? (growth / bs.peak - 1) * 100 : 0;
        }
        merged[`bench_${i}_return`] = bs.lastReturn;
        merged[`bench_${i}_drawdown`] = bs.lastDd;
      });
      return merged;
    });
  }, [filteredBacktestData, filteredLiveData, benchmarks]);

  // Live metrics: values from backend /summary, date lookups from client-side data
  const liveMetrics = useMemo(() => {
    const empty = { sharpe: null as number | null, sortino: null as number | null, maxDrawdown: null as number | null, maxDrawdownDate: "", annualized: null as number | null, calmar: null as number | null, winRate: null as number | null, bestDay: null as number | null, worstDay: null as number | null, bestDayDate: "", worstDayDate: "", cumReturn: null as number | null, twr: null as number | null, mwr: null as number | null, totalReturn: null as number | null, startDate: "", endDate: "" };
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

  // Backtest metrics: use backend summary_metrics for ALL period, client-side for filtered
  const btMetrics = useMemo(() => {
    const empty = { cumReturn: null as number | null, annualized: null as number | null, sharpe: null as number | null, sortino: null as number | null, calmar: null as number | null, maxDrawdown: null as number | null, medianDrawdown: null as number | null, longestDrawdownDays: null as number | null, medianDrawdownDays: null as number | null, winRate: null as number | null, volatility: null as number | null, startDate: "", endDate: "" };
    if (filteredBacktestData.length < 2) return empty;
    const first = filteredBacktestData[0];
    const last = filteredBacktestData[filteredBacktestData.length - 1];
    const startDate = first.date;
    const endDate = last.date;

    // Use pre-computed backend metrics for ALL period (only if cache has the newer drawdown fields)
    const sm = backtest?.summary_metrics;
    if (sm && sm.median_drawdown != null && period === "ALL" && !customStart && !customEnd) {
      return {
        cumReturn: sm.cumulative_return_pct / 100,
        annualized: (sm.annualized_return_cum ?? sm.annualized_return) / 100,
        sharpe: sm.sharpe_ratio,
        sortino: sm.sortino_ratio,
        calmar: sm.calmar_ratio,
        maxDrawdown: sm.max_drawdown / 100,
        medianDrawdown: sm.median_drawdown / 100,
        longestDrawdownDays: sm.longest_drawdown_days,
        medianDrawdownDays: sm.median_drawdown_days,
        winRate: sm.win_rate / 100,
        volatility: sm.annualized_volatility / 100,
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
    const ddTroughs: number[] = [];
    const ddLengths: number[] = [];
    let curTrough = 0;
    let curLen = 0;
    for (const pt of filteredBacktestData) {
      if (pt.value >= peak) {
        if (curLen > 0) {
          ddTroughs.push(curTrough);
          ddLengths.push(curLen);
          curTrough = 0;
          curLen = 0;
        }
        peak = pt.value;
      } else {
        const dd = peak > 0 ? (pt.value - peak) / peak : 0;
        curLen++;
        if (dd < curTrough) curTrough = dd;
        if (dd < maxDd) maxDd = dd;
      }
    }
    if (curLen > 0) {
      ddTroughs.push(curTrough);
      ddLengths.push(curLen);
    }
    const medianDrawdown = ddTroughs.length > 0 ? [...ddTroughs].sort((a, b) => a - b)[Math.floor(ddTroughs.length / 2)] : 0;
    const longestLen = ddLengths.length > 0 ? Math.max(...ddLengths) : 0;
    const medianDdLen = ddLengths.length > 0 ? [...ddLengths].sort((a, b) => a - b)[Math.floor(ddLengths.length / 2)] : 0;
    const calmar = maxDd < 0 ? annualized / Math.abs(maxDd) : null;
    const wins = dailyReturns.filter((r) => r > 0).length;
    const winRate = wins / n;
    return { cumReturn, annualized, sharpe, sortino, calmar, maxDrawdown: maxDd, medianDrawdown, longestDrawdownDays: longestLen, medianDrawdownDays: medianDdLen, winRate, volatility: stdDev / 100, startDate, endDate };
  }, [filteredBacktestData, backtest, period, customStart, customEnd]);

  return (
    <div
      data-testid="modal-symphony-detail"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 my-8 w-full max-w-7xl rounded-2xl border border-border bg-background shadow-2xl">
        {/* Close button */}
        <button
          data-testid="btn-close-symphony-detail"
          onClick={onClose}
          className="cursor-pointer absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
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
              <Metric
                label="Today's Change"
                value={fmtPct(s.last_percent_change)}
                color={colorVal(s.last_percent_change)}
                subValue={fmtSignedDollar(s.last_dollar_change)}
              />
              <Metric
                label="TWR"
                value={liveMetrics.twr != null ? fmtPct(liveMetrics.twr) : "—"}
                color={liveMetrics.twr != null ? colorVal(liveMetrics.twr) : "text-muted-foreground"}
                tooltip={TWR_TOOLTIP_TEXT}
              />
              <Metric label="Annualized" value={liveMetrics.annualized != null ? fmtPct(liveMetrics.annualized) : "—"} color={colorVal(liveMetrics.annualized ?? 0)} />
              <Metric label="Sortino" value={liveMetrics.sortino != null ? liveMetrics.sortino.toFixed(2) : "—"} />
              <Metric label="Max Drawdown" value={liveMetrics.maxDrawdown != null ? fmtPct(liveMetrics.maxDrawdown) : "—"} color="text-red-400" valueTooltip={liveMetrics.maxDrawdownDate ? new Date(liveMetrics.maxDrawdownDate + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined} />
              <Metric label="Profit" value={liveMetrics.totalReturn != null ? fmtSignedDollar(liveMetrics.totalReturn) : "—"} color={colorVal(liveMetrics.totalReturn ?? 0)} />
              <Metric label="Cum. Return" value={liveMetrics.cumReturn != null ? fmtPct(liveMetrics.cumReturn) : "—"} color={colorVal(liveMetrics.cumReturn ?? 0)} />
              <Metric label="MWR" value={liveMetrics.mwr != null ? fmtPct(liveMetrics.mwr) : "—"} color={colorVal(liveMetrics.mwr ?? 0)} tooltip="Money Weighted Return measures your actual return accounting for when and how much money you deposited or withdrew." />
              <Metric label="Win Rate" value={liveMetrics.winRate != null ? liveMetrics.winRate.toFixed(1) + "%" : "—"} />
              <Metric label="Calmar" value={liveMetrics.calmar != null ? liveMetrics.calmar.toFixed(2) : "—"} />
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
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5 w-fit">
              <button
                onClick={() => setTab("live")}
                className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === "live" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Live Performance
              </button>
              <button
                onClick={() => setTab("backtest")}
                className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === "backtest" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Backtest
              </button>
            </div>
            {tab === "backtest" && (
              <button
                onClick={() => fetchBacktest(true)}
                disabled={loadingBacktest}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="Refresh backtest (force recompute)"
              >
                <RefreshCw className={`h-4 w-4 ${loadingBacktest ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>

          {/* Chart area */}
          {tab === "live" ? (
            loadingLive ? (
              <div className="flex h-[320px] items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PerformanceChart
                data={mergedLiveData}
                period={period}
                onPeriodChange={(p) => setPeriod(p as Period)}
                startDate={customStart}
                endDate={customEnd}
                onStartDateChange={setCustomStart}
                onEndDateChange={setCustomEnd}
                portfolioLabel="Symphony Value"
                chartMode={chartMode}
                onChartModeChange={setChartMode}
                overlayKey="backtestTwr"
                overlayLabel="Backtest"
                overlayColor="#6366f1"
                showOverlay={showBacktestOverlay}
                onOverlayToggle={setShowBacktestOverlay}
                drawdownOverlayKey="backtestDrawdown"
                benchmarks={benchmarks}
                onBenchmarkAdd={handleBenchmarkAdd}
                onBenchmarkRemove={handleBenchmarkRemove}
              />
            )
          ) : (
            <div>
              {/* Backtest controls row */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                {/* Chart mode toggle */}
                <div className="flex rounded-lg bg-muted p-0.5">
                  {(["twr", "drawdown"] as ChartMode[]).map((m) => {
                    const active = chartMode === m || (m === "twr" && chartMode !== "drawdown");
                    return (
                      <button
                        key={m}
                        onClick={() => setChartMode(m)}
                        className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "twr" ? "Return" : "Drawdown"}
                      </button>
                    );
                  })}
                </div>

                <div className="h-5 w-px bg-border/50" />

                {/* Period pills */}
                <div className="flex rounded-lg bg-muted p-0.5">
                  {SYMPHONY_DETAIL_PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setCustomStart(""); setCustomEnd(""); }}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        period === p && !customStart && !customEnd
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  {oosDate && (
                    <button
                      onClick={() => { setPeriod("OOS"); setCustomStart(""); setCustomEnd(""); }}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        period === "OOS" && !customStart && !customEnd
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={`Out of Sample — from ${oosDate} (last edited)`}
                    >
                      OOS
                    </button>
                  )}
                </div>

                <div className="h-5 w-px bg-border/50" />

                {/* Date pickers */}
                <div className="flex items-center gap-2 text-xs">
                  <input type="date" value={customStart || (filteredBacktestData.length ? filteredBacktestData[0].date : "")} onChange={(e) => setCustomStart(e.target.value)} className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30" />
                  <span className="text-muted-foreground">to</span>
                  <input type="date" value={customEnd || (filteredBacktestData.length ? filteredBacktestData[filteredBacktestData.length - 1].date : "")} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-md border border-border/50 bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30" />
                  {(customStart || customEnd) && (
                    <button onClick={() => { setCustomStart(""); setCustomEnd(""); }} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Clear</button>
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
              ) : null}
              {chartMode !== "drawdown" && filteredBacktestData.length > 0 && !loadingBacktest && (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={mergedBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
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
                      <Tooltip content={backtestOverlayTooltip("twr", "Return", "liveTwr", "Live", showLiveOverlay, btFormatDate, mergedBacktestData, "return", benchmarks)} />
                      <Area type="monotone" dataKey="twr" stroke="url(#btTwrStroke)" strokeWidth={2} fill="url(#btTwrGrad)" dot={false} />
                      {showLiveOverlay && (
                        <Line type="monotone" dataKey="liveTwr" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
                      )}
                      {benchmarks.map((bench, i) => (
                        <Line key={`bt-bench-twr-${i}`} type="monotone" dataKey={`bench_${i}_return`} stroke={bench.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-400 cursor-default">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#10b981" }} />
                      Backtest
                    </button>
                    <button
                      onClick={() => setShowLiveOverlay(!showLiveOverlay)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        showLiveOverlay ? "text-amber-400" : "text-muted-foreground/40 line-through"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showLiveOverlay ? "#f59e0b" : "#71717a" }} />
                      Live
                    </button>
                  </div>
                </>
              )}
              {chartMode === "drawdown" && filteredBacktestData.length > 0 && (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={mergedBacktestData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <defs>
                        <linearGradient id="btDdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tickFormatter={btFormatDate} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
                      <YAxis tickFormatter={formatPctAxis} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                      <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 4" strokeOpacity={0.5} />
                      <Tooltip content={backtestOverlayTooltip("drawdown", "Drawdown", "liveDrawdown", "Live", showLiveOverlay, btFormatDate, mergedBacktestData, "drawdown", benchmarks)} />
                      <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#btDdGrad)" baseValue={0} dot={false} />
                      {showLiveOverlay && (
                        <Line type="monotone" dataKey="liveDrawdown" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
                      )}
                      {benchmarks.map((bench, i) => (
                        <Line key={`bt-bench-dd-${i}`} type="monotone" dataKey={`bench_${i}_drawdown`} stroke={bench.color} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-400 cursor-default">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                      Backtest
                    </button>
                    <button
                      onClick={() => setShowLiveOverlay(!showLiveOverlay)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        showLiveOverlay ? "text-amber-400" : "text-muted-foreground/40 line-through"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: showLiveOverlay ? "#f59e0b" : "#71717a" }} />
                      Live
                    </button>
                  </div>
                </>
              )}

              {/* Benchmark toggle row for backtest tab */}
              {filteredBacktestData.length > 0 && (
                <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1">Benchmark:</span>
                  {["SPY", "QQQ", "TQQQ"].map((t) => {
                    const entry = benchmarks.find((b) => b.ticker === t);
                    const isActive = !!entry;
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          if (isActive) { handleBenchmarkRemove(t); }
                          else if (benchmarks.length < MAX_BENCHMARKS) { handleBenchmarkAdd(t); }
                        }}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? (isLightColor(entry.color) ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]" : "")
                            : benchmarks.length >= MAX_BENCHMARKS
                              ? "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
                              : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
                        }`}
                        style={isActive && !isLightColor(entry.color) ? benchBtnStyle(entry.color) : undefined}
                        disabled={!isActive && benchmarks.length >= MAX_BENCHMARKS}
                      >
                        {t}
                      </button>
                    );
                  })}
                  {!btCustomInput ? (
                    <button
                      onClick={() => setBtCustomInput(true)}
                      disabled={benchmarks.length >= MAX_BENCHMARKS}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
                        benchmarks.length >= MAX_BENCHMARKS
                          ? "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
                      }`}
                    >
                      +
                    </button>
                  ) : (
                    <div className="relative" ref={btDropdownRef}>
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const raw = btCustomTickerInput.trim();
                          if (!raw || benchmarks.length >= MAX_BENCHMARKS) return;
                          const symMatch = raw.match(/composer\.trade\/symphony\/([^/\s?]+)/);
                          if (symMatch) {
                            handleBenchmarkAdd(`symphony:${symMatch[1]}`);
                          } else {
                            handleBenchmarkAdd(raw.toUpperCase());
                          }
                          setBtCustomTickerInput("");
                          setBtCustomInput(false);
                          setCatalogDropdownOpen(false);
                        }}
                      >
                        <input
                          autoFocus
                          value={btCustomTickerInput}
                          onChange={(e) => { setBtCustomTickerInput(e.target.value); setCatalogDropdownOpen(true); }}
                          placeholder="Symphony name/link or Ticker"
                          className="w-56 rounded-md border border-border/50 bg-muted px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
                          onFocus={() => setCatalogDropdownOpen(true)}
                          onBlur={() => { setTimeout(() => { if (!btCustomTickerInput.trim()) { setBtCustomInput(false); setCatalogDropdownOpen(false); } }, 200); }}
                        />
                        <button type="submit" className="cursor-pointer rounded-md bg-orange-500/20 px-2 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30">Go</button>
                  <button
                    type="button"
                    onClick={() => {
                      refreshSymphonyCatalog().catch(() => undefined);
                    }}
                    className="cursor-pointer rounded-md bg-muted/50 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Refresh symphony list"
                  >
                          ↻
                        </button>
                      </form>
                      {catalogDropdownOpen && btCatalogMatches.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border/50 bg-card shadow-lg max-h-48 overflow-y-auto">
                          {btCatalogMatches.map((item) => (
                            <button
                              key={item.symphony_id}
                              type="button"
                              className="w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-muted/60 flex items-center justify-between gap-2"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleBenchmarkAdd(`symphony:${item.symphony_id}`);
                                setBtCustomTickerInput("");
                                setBtCustomInput(false);
                                setCatalogDropdownOpen(false);
                              }}
                            >
                              <span className="truncate text-foreground">{item.name}</span>
                              <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                                item.source === "invested" ? "bg-emerald-500/20 text-emerald-400" :
                                item.source === "watchlist" ? "bg-blue-500/20 text-blue-400" :
                                "bg-amber-500/20 text-amber-400"
                              }`}>{item.source}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {benchmarks.filter((b) => !["SPY", "QQQ", "TQQQ"].includes(b.ticker)).map((b) => (
                    <button
                      key={b.ticker}
                      onClick={() => handleBenchmarkRemove(b.ticker)}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${isLightColor(b.color) ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]" : ""}`}
                      style={!isLightColor(b.color) ? benchBtnStyle(b.color) : undefined}
                    >
                      {b.label} ✕
                    </button>
                  ))}
                </div>
              )}
              <BacktestMetricsSummary btMetrics={btMetrics} show={filteredBacktestData.length >= 2} />
            </div>
          )}

          {tab === "live" && <SymphonyLiveHoldingsSection holdings={s.holdings} />}

          {tab === "backtest" && (
            <SymphonyBacktestHoldingsSection tdvmWeights={backtest?.tdvm_weights} />
          )}

          {tab === "live" && (
            <div ref={tradePreviewRef}>
              <SymphonyTradePreviewSection
                tradePreview={tradePreview}
                tradePreviewRefreshedAt={tradePreviewRefreshedAt}
                loadingTradePreview={loadingTradePreview}
                onRefresh={() => {
                  fetchTradePreview().catch(() => undefined);
                }}
              />
            </div>
          )}

          {/* Historical Allocations — live (from daily sync snapshots) */}
          {tab === "live" && Object.keys(liveAllocations).length > 0 && (
            <HistoricalAllocationsTable tdvmWeights={liveAllocations} label="Historical Allocations (Live)" isLive />
          )}

          {/* Historical Allocations — backtest (from backtest tdvm_weights) */}
          {tab === "backtest" && backtest && Object.keys(backtest.tdvm_weights).length > 0 && (
            <HistoricalAllocationsTable tdvmWeights={backtest.tdvm_weights} label="Historical Allocations (Backtest)" />
          )}
        </div>
      </div>
    </div>
  );
}


