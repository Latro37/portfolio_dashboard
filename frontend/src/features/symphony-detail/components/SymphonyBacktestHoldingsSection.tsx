"use client";

import { epochDayToDate } from "@/features/symphony-detail/utils";

type Props = {
  tdvmWeights?: Record<string, Record<string, number>>;
};

export function SymphonyBacktestHoldingsSection({ tdvmWeights }: Props) {
  if (!tdvmWeights) return null;
  const entries = Object.entries(tdvmWeights);
  if (!entries.length) return null;

  let maxDay = -Infinity;
  for (const [, dayMap] of entries) {
    for (const day of Object.keys(dayMap)) {
      const n = Number(day);
      if (n > maxDay) maxDay = n;
    }
  }

  const holdings = entries
    .map(([ticker, dayMap]) => ({
      ticker,
      allocation: (dayMap[String(maxDay)] ?? 0) * 100,
    }))
    .filter((holding) => holding.allocation > 0)
    .sort((a, b) => b.allocation - a.allocation);

  if (!holdings.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Latest Holdings (Backtest)
        <span className="ml-2 text-xs font-normal normal-case text-muted-foreground/60">
          {epochDayToDate(maxDay)}
        </span>
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
            {holdings.map((holding) => (
              <tr key={holding.ticker} className="border-b border-border/30">
                <td className="py-2 pr-3 font-medium">{holding.ticker}</td>
                <td className="py-2 text-right">{holding.allocation.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
