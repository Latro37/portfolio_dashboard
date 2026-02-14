"use client";

import { SymphonyHolding } from "@/lib/api";
import { colorVal, fmtDollar, fmtPct } from "@/features/symphony-detail/utils";

type Props = {
  holdings: SymphonyHolding[];
};

export function SymphonyLiveHoldingsSection({ holdings }: Props) {
  if (!holdings.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Current Holdings (Live)
      </h3>
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
            {[...holdings]
              .sort((a, b) => b.value - a.value)
              .map((holding) => (
                <tr key={holding.ticker} className="border-b border-border/30">
                  <td className="py-2 pr-3 font-medium">{holding.ticker}</td>
                  <td className="py-2 pr-3 text-right">
                    {holding.allocation.toFixed(1)}%
                  </td>
                  <td className="py-2 pr-3 text-right">{fmtDollar(holding.value)}</td>
                  <td
                    className={`py-2 text-right ${colorVal(holding.last_percent_change)}`}
                  >
                    {fmtPct(holding.last_percent_change)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
