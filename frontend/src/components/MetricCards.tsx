"use client";

import { Summary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  summary: Summary;
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <p className="text-base font-medium text-foreground/70">{label}</p>
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
      <Metric label="TWR" value={fmtPct(s.time_weighted_return)} color={colorPct(s.time_weighted_return)} />
      <Metric label="MWR" value={fmtPct(s.money_weighted_return)} color={colorPct(s.money_weighted_return)} />
      <Metric label="Sharpe" value={s.sharpe_ratio.toFixed(2)} />
      <Metric label="Sortino" value={s.sortino_ratio.toFixed(2)} />
      <Metric label="Max Drawdown" value={fmtPct(s.max_drawdown)} color="text-red-400" />
      <Metric label="Current DD" value={fmtPct(s.current_drawdown)} color={s.current_drawdown < 0 ? "text-red-400" : undefined} />
      <Metric label="Win Rate" value={s.win_rate.toFixed(1) + "%"} />
      <Metric label="W / L" value={`${s.num_wins} / ${s.num_losses}`} />
      <Metric label="Volatility" value={s.annualized_volatility.toFixed(1) + "%"} />
      <Metric label="Best Day" value={fmtPct(s.best_day_pct)} color="text-emerald-400" />
      <Metric label="Worst Day" value={fmtPct(s.worst_day_pct)} color="text-red-400" />
    </div>
  );
}
