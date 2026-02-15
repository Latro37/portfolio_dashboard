"use client";

import { type RefObject } from "react";
import { RefreshCw } from "lucide-react";

import { showToast } from "@/components/Toast";
import { BenchmarkEntry, SymphonyCatalogItem } from "@/lib/api";

type Props = {
  hasData: boolean;
  benchmarks: BenchmarkEntry[];
  maxBenchmarks: number;
  customInputVisible: boolean;
  customTickerInput: string;
  catalogDropdownOpen: boolean;
  catalogMatches: SymphonyCatalogItem[];
  benchmarkDropdownRef: RefObject<HTMLDivElement | null>;
  onAddBenchmark: (ticker: string) => void;
  onRemoveBenchmark: (ticker: string) => void;
  onCustomInputVisibleChange: (next: boolean) => void;
  onCustomTickerInputChange: (value: string) => void;
  onCatalogDropdownOpenChange: (next: boolean) => void;
  onRefreshCatalog: () => void;
};

export function SymphonyBacktestBenchmarkRow({
  hasData,
  benchmarks,
  maxBenchmarks,
  customInputVisible,
  customTickerInput,
  catalogDropdownOpen,
  catalogMatches,
  benchmarkDropdownRef,
  onAddBenchmark,
  onRemoveBenchmark,
  onCustomInputVisibleChange,
  onCustomTickerInputChange,
  onCatalogDropdownOpenChange,
  onRefreshCatalog,
}: Props) {
  if (!hasData) {
    return null;
  }

  const isLightColor = (color: string) => color === "#e4e4e7";
  const benchBtnStyle = (color: string) =>
    isLightColor(color)
      ? {
          backgroundColor: color,
          color: "#1a1a1a",
          fontWeight: 700,
          boxShadow: `0 0 0 1px ${color}`,
        }
      : {
          backgroundColor: `${color}20`,
          color,
          boxShadow: `0 0 0 1px ${color}66`,
        };

  return (
    <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground mr-1">Benchmark:</span>
      {["SPY", "QQQ", "TQQQ"].map((ticker) => {
        const entry = benchmarks.find((benchmark) => benchmark.ticker === ticker);
        const isActive = !!entry;
        return (
          <button
            key={ticker}
            onClick={() => {
              if (isActive) onRemoveBenchmark(ticker);
              else if (benchmarks.length < maxBenchmarks) onAddBenchmark(ticker);
              else showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
            }}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? isLightColor(entry.color)
                  ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]"
                  : ""
                : benchmarks.length >= maxBenchmarks
                  ? "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
            }`}
            style={isActive && !isLightColor(entry.color) ? benchBtnStyle(entry.color) : undefined}
            disabled={!isActive && benchmarks.length >= maxBenchmarks}
          >
            {ticker}
          </button>
        );
      })}

      {!customInputVisible ? (
        <button
          onClick={() => {
            if (benchmarks.length >= maxBenchmarks) {
              showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
              return;
            }
            onCustomInputVisibleChange(true);
          }}
          disabled={benchmarks.length >= maxBenchmarks}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
            benchmarks.length >= maxBenchmarks
              ? "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
              : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
          }`}
        >
          +
        </button>
      ) : (
        <div className="relative" ref={benchmarkDropdownRef}>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const raw = customTickerInput.trim();
              if (!raw) return;
              if (benchmarks.length >= maxBenchmarks) {
                showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
                return;
              }
              const symMatch = raw.match(/composer\.trade\/symphony\/([^/\s?]+)/);
              if (symMatch) onAddBenchmark(`symphony:${symMatch[1]}`);
              else onAddBenchmark(raw.toUpperCase());
              onCustomTickerInputChange("");
              onCustomInputVisibleChange(false);
              onCatalogDropdownOpenChange(false);
            }}
          >
            <input
              autoFocus
              value={customTickerInput}
              onChange={(e) => {
                onCustomTickerInputChange(e.target.value);
                onCatalogDropdownOpenChange(true);
              }}
              placeholder="Symphony name/link or Ticker"
              className="w-56 rounded-md border border-border/50 bg-muted px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
              onFocus={() => onCatalogDropdownOpenChange(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (!customTickerInput.trim()) {
                    onCustomInputVisibleChange(false);
                    onCatalogDropdownOpenChange(false);
                  }
                }, 200);
              }}
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-orange-500/20 px-2 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30"
            >
              Go
            </button>
            <button
              type="button"
              onClick={onRefreshCatalog}
              className="cursor-pointer rounded-md bg-muted/50 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              title="Refresh symphony list"
              aria-label="Refresh symphony list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </form>
          {catalogDropdownOpen && catalogMatches.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border/50 bg-card shadow-lg max-h-48 overflow-y-auto">
              {catalogMatches.map((item) => (
                <button
                  key={item.symphony_id}
                  type="button"
                  className="w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-muted/60 flex items-center justify-between gap-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (benchmarks.length >= maxBenchmarks) {
                      showToast(`You can add up to ${maxBenchmarks} benchmarks.`, "error");
                      return;
                    }
                    onAddBenchmark(`symphony:${item.symphony_id}`);
                    onCustomTickerInputChange("");
                    onCustomInputVisibleChange(false);
                    onCatalogDropdownOpenChange(false);
                  }}
                >
                  <span className="truncate text-foreground">{item.name}</span>
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                      item.source === "invested"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : item.source === "watchlist"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {item.source}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {benchmarks
        .filter((benchmark) => !["SPY", "QQQ", "TQQQ"].includes(benchmark.ticker))
        .map((benchmark) => (
          <button
            key={benchmark.ticker}
            onClick={() => onRemoveBenchmark(benchmark.ticker)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
              isLightColor(benchmark.color)
                ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]"
                : ""
            }`}
            style={!isLightColor(benchmark.color) ? benchBtnStyle(benchmark.color) : undefined}
          >
            {benchmark.label} x
          </button>
        ))}
    </div>
  );
}
