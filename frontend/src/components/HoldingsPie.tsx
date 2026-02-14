"use client";

import { HoldingsResponse } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

interface Props {
  holdings: HoldingsResponse | null;
}

export function HoldingsPie({ holdings }: Props) {
  if (!holdings || !holdings.holdings.length) return null;

  const data = holdings.holdings
    .filter((h) => h.market_value > 0.01)
    .sort((a, b) => b.market_value - a.market_value)
    .map((h) => ({
      name: h.symbol,
      value: h.allocation_pct,
    }));

  return (
    <Card className="border-border/50 max-h-[500px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-medium text-foreground/70">
          Holdings Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={380}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={90}
              outerRadius={155}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 13,
                color: "#f4f4f5",
              }}
              itemStyle={{ color: "#f4f4f5" }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(value: number | string, name: string) => [`${Number(value).toFixed(1)}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
