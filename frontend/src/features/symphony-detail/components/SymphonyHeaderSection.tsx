"use client";

import { SymphonyInfo } from "@/lib/api";

type Props = {
  symphony: SymphonyInfo;
};

export function SymphonyHeaderSection({ symphony }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="h-3.5 w-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: symphony.color }}
        />
        <h2 className="text-xl font-bold">{symphony.name}</h2>
      </div>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>Invested since {symphony.invested_since}</span>
        {symphony.rebalance_frequency && (
          <span>Rebalance: {symphony.rebalance_frequency}</span>
        )}
        {symphony.last_rebalance_on && (
          <span>
            Last rebalance: {new Date(symphony.last_rebalance_on).toLocaleDateString()}
          </span>
        )}
        <span className="text-muted-foreground/60">{symphony.account_name}</span>
      </div>
    </div>
  );
}
