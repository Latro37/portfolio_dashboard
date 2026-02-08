"use client";

import { Summary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";

interface Props {
  summary: Summary;
}

function Metric({ label, value, color, tooltip }: { label: string; value: string; color?: string; tooltip?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <p className="text-base font-medium text-foreground/70 flex items-center gap-1.5">
          {label}
          {tooltip && (
            <span className="relative group/tip inline-flex">
              <Info className="h-3.5 w-3.5 text-foreground/40 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-foreground w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-10">
                {tooltip}
              </span>
            </span>
          )}
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
      <Metric label="Total Return" value={fmtDollar(s.total_return_dollars)} color={colorPct(s.total_return_dollars)} />
      <Metric label="TWR" value={fmtPct(s.time_weighted_return)} color={colorPct(s.time_weighted_return)} tooltip="Measures portfolio growth independent of cash flows such as deposits. Each day's gain/loss is compounded together to show how the strategy itself performed, regardless of when you added or withdrew money. Measures the performance of the strategy, not the timing of entry or exit." />
      <Metric label="Win Rate" value={s.win_rate.toFixed(1) + "%"} />
      <Metric label="Sharpe" value={s.sharpe_ratio.toFixed(2)} />
      <Metric label="Volatility" value={s.annualized_volatility.toFixed(1) + "%"} />
      <Metric label="Best Day" value={fmtPct(s.best_day_pct)} color="text-emerald-400" tooltip={s.best_day_date ?? undefined} />
      <Metric label="Cumulative Return" value={fmtPct(s.cumulative_return_pct)} color={colorPct(s.cumulative_return_pct)} />
      <Metric label="MWR" value={fmtPct(s.money_weighted_return)} color={colorPct(s.money_weighted_return)} tooltip="Measures your actual return accounting for when and how much money you deposited or withdrew. Weights each cash flow by how long it was invested, so a large deposit right before a gain counts more than a small one. Better reflects your actual investor experience." />
      <Metric label="W / L" value={`${s.num_wins} / ${s.num_losses}`} />
      <Metric label="Sortino" value={s.sortino_ratio.toFixed(2)} />
      <Metric label="Max Drawdown" value={fmtPct(s.max_drawdown)} color="text-red-400" tooltip={s.max_drawdown_date ?? undefined} />
      <Metric label="Worst Day" value={fmtPct(s.worst_day_pct)} color="text-red-400" tooltip={s.worst_day_date ?? undefined} />
    </div>
  );
}
