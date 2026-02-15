"use client";

import { useMemo, useState } from "react";

import { epochDayToDate } from "@/features/symphony-detail/utils";

type Props = {
  tdvmWeights: Record<string, Record<string, number>>;
  label?: string;
  isLive?: boolean;
};

export function HistoricalAllocationsTable({
  tdvmWeights,
  label,
  isLive,
}: Props) {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { rows, tickers } = useMemo(() => {
    const tickerSet = new Set<string>();

    if (isLive) {
      const dateKeys = Object.keys(tdvmWeights).sort().reverse();
      const liveRows = dateKeys.map((dateKey) => {
        const allocations = tdvmWeights[dateKey];
        for (const ticker of Object.keys(allocations)) tickerSet.add(ticker);
        return { dateStr: dateKey, allocations };
      });
      return { rows: liveRows, tickers: Array.from(tickerSet).sort() };
    }

    const daySet = new Set<string>();
    for (const [ticker, dayMap] of Object.entries(tdvmWeights)) {
      tickerSet.add(ticker);
      for (const day of Object.keys(dayMap)) daySet.add(day);
    }
    const sortedDays = Array.from(daySet)
      .map(Number)
      .sort((a, b) => b - a);
    const backtestRows = sortedDays.map((day) => {
      const allocations: Record<string, number> = {};
      for (const [ticker, dayMap] of Object.entries(tdvmWeights)) {
        const weight = dayMap[String(day)];
        if (weight != null) allocations[ticker] = weight * 100;
      }
      return { dateStr: epochDayToDate(day), allocations };
    });
    return { rows: backtestRows, tickers: Array.from(tickerSet).sort() };
  }, [tdvmWeights, isLive]);

  const pageCount = Math.ceil(rows.length / pageSize);
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  if (!rows.length || !tickers.length) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {label || "Historical Allocations"}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 pr-3 font-medium sticky left-0 bg-background">
                Date
              </th>
              {tickers.map((ticker) => (
                <th key={ticker} className="pb-2 px-2 font-medium text-right">
                  {ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ dateStr, allocations }) => (
              <tr key={dateStr} className="border-b border-border/20">
                <td className="py-1.5 pr-3 font-medium sticky left-0 bg-background whitespace-nowrap">
                  {dateStr}
                </td>
                {tickers.map((ticker) => {
                  const pct = allocations[ticker];
                  return (
                    <td
                      key={ticker}
                      className="py-1.5 px-2 text-right tabular-nums text-muted-foreground"
                    >
                      {pct != null ? `${pct.toFixed(1)}%` : "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="cursor-pointer rounded px-2 py-1 bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <button
            onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            className="cursor-pointer rounded px-2 py-1 bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
