"use client";

import { forwardRef, useMemo } from "react";

import { adaptSnapshotChart } from "@/features/charting/snapshotChartAdapter";
import { useObservedSpyTradingDays } from "@/features/charting/hooks/useObservedSpyTradingDays";
import { SnapshotBenchmarkLegend } from "@/features/dashboard/snapshot/SnapshotBenchmarkLegend";
import { SnapshotChart } from "@/features/dashboard/snapshot/SnapshotChart";
import { SnapshotHeader } from "@/features/dashboard/snapshot/SnapshotHeader";
import { SnapshotMetricCardsGrid } from "@/features/dashboard/snapshot/SnapshotMetricCardsGrid";
import {
  buildSnapshotMetricCards,
} from "@/features/dashboard/snapshot/metricCards";
import type {
  SnapshotBenchmark,
  SnapshotChartMode,
  SnapshotPeriodReturns,
} from "@/features/dashboard/snapshot/types";
import { PerformancePoint, Summary } from "@/lib/api";

interface Props {
  data: PerformancePoint[];
  summary: Summary;
  chartMode: SnapshotChartMode;
  selectedMetrics: string[];
  hidePortfolioValue: boolean;
  todayDollarChange?: number;
  todayPctChange?: number;
  periodReturns?: SnapshotPeriodReturns;
  benchmarks?: SnapshotBenchmark[];
}

export type { SnapshotBenchmark } from "@/features/dashboard/snapshot/types";
export {
  DEFAULT_METRICS,
  METRIC_OPTIONS,
} from "@/features/dashboard/snapshot/metricCards";

export const SnapshotView = forwardRef<HTMLDivElement, Props>(
  function SnapshotView(
    {
      data,
      summary,
      chartMode,
      selectedMetrics,
      hidePortfolioValue,
      todayDollarChange,
      todayPctChange,
      periodReturns,
      benchmarks = [],
    },
    ref,
  ) {
    const sourceDates = useMemo(() => data.map((point) => point.date), [data]);
    const tradingDayEvidence = useObservedSpyTradingDays(sourceDates);
    const dataset = adaptSnapshotChart(data, benchmarks, tradingDayEvidence);
    const tradingData = dataset.points as (PerformancePoint & Record<string, number>)[];
    const hasData = dataset.hasData;
    const todayStr = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const dayPct = todayPctChange ?? summary.daily_return_pct;
    const dayDollar = todayDollarChange ?? 0;
    const hasTodayMetric =
      selectedMetrics.includes("today_dollar") ||
      selectedMetrics.includes("today_pct");

    const metricCards = buildSnapshotMetricCards(
      summary,
      selectedMetrics,
      hidePortfolioValue,
      dayPct,
      hasTodayMetric,
      {
        todayDollar: dayDollar,
        todayPct: dayPct,
        periodReturns,
      },
    );

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
        <SnapshotHeader
          chartMode={chartMode}
          todayStr={todayStr}
          hidePortfolioValue={hidePortfolioValue}
          hasTodayMetric={hasTodayMetric}
          dayPct={dayPct}
          dayDollar={dayDollar}
          summary={summary}
          hasData={hasData}
          startDate={hasData ? tradingData[0].date : undefined}
          endDate={hasData ? tradingData[tradingData.length - 1].date : undefined}
        />

        <SnapshotChart
          tradingData={tradingData}
          hasData={hasData}
          chartMode={chartMode}
          benchmarks={benchmarks}
        />

        <SnapshotBenchmarkLegend benchmarks={benchmarks} chartMode={chartMode} />

        <SnapshotMetricCardsGrid metricCards={metricCards} />
      </div>
    );
  },
);
