"use client";

import { HoldingsResponse } from "@/lib/api";
import { QuoteData } from "@/hooks/useFinnhubQuotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

interface Props {
  holdings: HoldingsResponse | null;
  quotes?: Record<string, QuoteData>;
}

export function HoldingsList({ holdings, quotes }: Props) {
  if (!holdings || !holdings.holdings.length) return null;

  return (
    <Card className="border-border/50 max-h-[500px] flex flex-col">
      <CardHeader className="pb-1 flex-shrink-0">
        <CardTitle className="text-xl font-medium text-foreground/70">
          Holdings &middot; {holdings.date}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 overflow-y-auto">
        {[...holdings.holdings].filter((h) => h.market_value > 0.01).sort((a, b) => b.market_value - a.market_value).map((h, i) => (
          <div key={h.symbol} className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-medium text-lg">{h.symbol}</span>
                  {quotes?.[h.symbol] && quotes[h.symbol].change !== 0 && (
                    <span
                      className={`text-xs tabular-nums ${
                        quotes[h.symbol].change >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {quotes[h.symbol].change >= 0 ? "+" : "-"}${Math.abs(quotes[h.symbol].change).toFixed(2)}{" "}
                      ({quotes[h.symbol].changePct >= 0 ? "+" : ""}{quotes[h.symbol].changePct.toFixed(2)}%)
                    </span>
                  )}
                </span>
                <span className="text-base text-foreground/70">
                  {h.allocation_pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(h.allocation_pct, 100)}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0 w-28">
              <span className="text-sm font-medium tabular-nums">
                ${h.market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {h.quantity > 0 && (
                <span className="text-xs text-foreground/50 tabular-nums">
                  {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
