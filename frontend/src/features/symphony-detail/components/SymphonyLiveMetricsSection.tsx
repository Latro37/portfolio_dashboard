"use client";

import { InfoTooltip, TWR_TOOLTIP_TEXT } from "@/components/InfoTooltip";
import { SymphonyInfo } from "@/lib/api";
import {
  colorVal,
  fmtDollar,
  fmtPct,
  fmtSignedDollar,
} from "@/features/symphony-detail/utils";

export type SymphonyLiveMetricsView = {
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  maxDrawdownDate: string | null;
  annualized: number | null;
  calmar: number | null;
  winRate: number | null;
  bestDay: number | null;
  worstDay: number | null;
  bestDayDate: string | null;
  worstDayDate: string | null;
  cumReturn: number | null;
  twr: number | null;
  mwr: number | null;
  totalReturn: number | null;
  startDate: string;
  endDate: string;
};

type MetricCardProps = {
  label: string;
  value: string;
  color?: string;
  subValue?: string;
  tooltip?: string;
  valueTooltip?: string;
  subValueColor?: string;
  subValueTooltip?: string;
  subValueLarge?: boolean;
};

function MetricCard({
  label,
  value,
  color,
  subValue,
  tooltip,
  valueTooltip,
  subValueColor,
  subValueTooltip,
  subValueLarge,
}: MetricCardProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums flex items-center gap-1 ${
          color || "text-foreground"
        }`}
      >
        {value}
        {valueTooltip && <InfoTooltip text={valueTooltip} />}
      </div>
      {subValue && (
        <div
          className={`${
            subValueLarge ? "mt-0.5 text-lg font-semibold" : "text-xs"
          } tabular-nums flex items-center gap-1 ${
            subValueColor || color || "text-muted-foreground"
          }`}
        >
          {subValue}
          {subValueTooltip && <InfoTooltip text={subValueTooltip} />}
        </div>
      )}
    </div>
  );
}

type Props = {
  symphony: SymphonyInfo;
  liveMetrics: SymphonyLiveMetricsView;
};

export function SymphonyLiveMetricsSection({ symphony, liveMetrics }: Props) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Live Metrics
        {liveMetrics.startDate && liveMetrics.endDate && (
          <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">
            {new Date(`${liveMetrics.startDate}T00:00`).toLocaleDateString(
              "en-US",
              { month: "short", day: "numeric", year: "numeric" },
            )}
            {" - "}
            {new Date(`${liveMetrics.endDate}T00:00`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Current Value" value={fmtDollar(symphony.value)} />
        <MetricCard
          label="Today's Change"
          value={fmtPct(symphony.last_percent_change)}
          color={colorVal(symphony.last_percent_change)}
          subValue={fmtSignedDollar(symphony.last_dollar_change)}
        />
        <MetricCard
          label="TWR"
          value={liveMetrics.twr != null ? fmtPct(liveMetrics.twr) : "-"}
          color={liveMetrics.twr != null ? colorVal(liveMetrics.twr) : "text-muted-foreground"}
          tooltip={TWR_TOOLTIP_TEXT}
        />
        <MetricCard
          label="Annualized"
          value={liveMetrics.annualized != null ? fmtPct(liveMetrics.annualized) : "-"}
          color={colorVal(liveMetrics.annualized ?? 0)}
        />
        <MetricCard
          label="Sortino"
          value={liveMetrics.sortino != null ? liveMetrics.sortino.toFixed(2) : "-"}
        />
        <MetricCard
          label="Max Drawdown"
          value={liveMetrics.maxDrawdown != null ? fmtPct(liveMetrics.maxDrawdown) : "-"}
          color="text-red-400"
          valueTooltip={
            liveMetrics.maxDrawdownDate
              ? new Date(`${liveMetrics.maxDrawdownDate}T00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : undefined
          }
        />
        <MetricCard
          label="Profit"
          value={liveMetrics.totalReturn != null ? fmtSignedDollar(liveMetrics.totalReturn) : "-"}
          color={colorVal(liveMetrics.totalReturn ?? 0)}
        />
        <MetricCard
          label="Cum. Return"
          value={liveMetrics.cumReturn != null ? fmtPct(liveMetrics.cumReturn) : "-"}
          color={colorVal(liveMetrics.cumReturn ?? 0)}
        />
        <MetricCard
          label="MWR"
          value={liveMetrics.mwr != null ? fmtPct(liveMetrics.mwr) : "-"}
          color={colorVal(liveMetrics.mwr ?? 0)}
          tooltip="Money Weighted Return measures your actual return accounting for when and how much money you deposited or withdrew."
        />
        <MetricCard
          label="Win Rate"
          value={liveMetrics.winRate != null ? `${liveMetrics.winRate.toFixed(1)}%` : "-"}
        />
        <MetricCard
          label="Calmar"
          value={liveMetrics.calmar != null ? liveMetrics.calmar.toFixed(2) : "-"}
        />
        <MetricCard
          label="Best / Worst Day"
          value={liveMetrics.bestDay != null ? fmtPct(liveMetrics.bestDay) : "-"}
          color="text-emerald-400"
          valueTooltip={
            liveMetrics.bestDayDate
              ? new Date(`${liveMetrics.bestDayDate}T00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : undefined
          }
          subValue={liveMetrics.worstDay != null ? fmtPct(liveMetrics.worstDay) : "-"}
          subValueLarge
          subValueColor="text-red-400"
          subValueTooltip={
            liveMetrics.worstDayDate
              ? new Date(`${liveMetrics.worstDayDate}T00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : undefined
          }
        />
      </div>
    </div>
  );
}
