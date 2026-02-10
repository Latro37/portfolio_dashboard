"use client";

import { Summary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTooltip } from "./InfoTooltip";

interface Props {
  summary: Summary;
}

function Metric({ label, value, color, tooltip }: { label: string; value: string; color?: string; tooltip?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <p className="text-base font-medium text-foreground/70 flex items-center gap-1.5">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </p>
        <p className={`mt-1 text-3xl font-semibold ${color || "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function fmtPct(v: number) {
  const s = v.toFixed(2) + "%";
  return v >= 0 ? "+" + s : s;
}

function fmtDollar(v: number) {
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function colorPct(v: number) {
  return v >= 0 ? "text-emerald-400" : "text-red-400";
}

export function MetricCards({ summary }: Props) {
  const s = summary;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Metric label="Annualized Return" value={fmtPct(s.annualized_return_cum)} color={colorPct(s.annualized_return_cum)} tooltip="Your cumulative return annualized using compound growth. Reflects your real-world investment growth rate." />
      <Metric label="TWR" value={fmtPct(s.time_weighted_return)} color={colorPct(s.time_weighted_return)} tooltip="Time Weighted Return measures portfolio growth independent of cash flows such as deposits. Each day's gain/loss is compounded together to show how the strategy itself performed, ignoring how well you timed the entry or exit." />
      <Metric label="Win Rate" value={s.win_rate.toFixed(1) + "%"} />
      <Metric label="Sharpe" value={s.sharpe_ratio.toFixed(2)} />
      <Metric label="Volatility" value={s.annualized_volatility.toFixed(1) + "%"} />
      <Metric label="Best Day" value={fmtPct(s.best_day_pct)} color="text-emerald-400" tooltip={s.best_day_date ?? undefined} />
      <Metric label="Cumulative Return" value={fmtPct(s.cumulative_return_pct)} color={colorPct(s.cumulative_return_pct)} />
      <Metric label="MWR" value={fmtPct(s.money_weighted_return_period)} color={colorPct(s.money_weighted_return_period)} tooltip="Money Weighted Return measures your actual return accounting for when and how much money you deposited or withdrew. Weights each cash flow by how long it was invested, so a large deposit right before a gain counts more than a small one. MWR > TWR means you timed your entries well." />
      <Metric label="W / L" value={`${s.num_wins} / ${s.num_losses}`} />
      <Metric label="Calmar" value={s.calmar_ratio.toFixed(2)} />
      <Metric label="Max Drawdown" value={fmtPct(s.max_drawdown)} color="text-red-400" tooltip={s.max_drawdown_date ?? undefined} />
      <Metric label="Worst Day" value={fmtPct(s.worst_day_pct)} color="text-red-400" tooltip={s.worst_day_date ?? undefined} />
    </div>
  );
}
