"use client";

import { HoldingsResponse } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

interface Props {
  holdings: HoldingsResponse | null;
}

export function HoldingsList({ holdings }: Props) {
  if (!holdings || !holdings.holdings.length) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-foreground/70">
          Holdings &middot; {holdings.date}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {holdings.holdings.map((h, i) => (
          <div key={h.symbol} className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-lg">{h.symbol}</span>
                <span className="text-base text-foreground/70">
                  {h.allocation_pct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(h.allocation_pct, 100)}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
            <span className="text-sm text-foreground/70 tabular-nums w-24 text-right">
              {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} shares
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
