import type { RefObject } from "react";

import type { BenchmarkEntry, SymphonyCatalogItem } from "@/lib/api";

type Props = {
  benchmarks: BenchmarkEntry[];
  maxBenchmarks: number;
  showCustomInput: boolean;
  customTickerInput: string;
  catalogDropdownOpen: boolean;
  catalogMatches: SymphonyCatalogItem[];
  dropdownRef: RefObject<HTMLDivElement | null>;
  onPresetToggle: (ticker: string) => void;
  onOpenCustomInput: () => void;
  onInputChange: (value: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onSubmitCustom: () => void;
  onRefreshCatalog: () => void;
  onSelectCatalogItem: (symphonyId: string) => void;
  onRemoveBenchmark: (ticker: string) => void;
};

const PRESET_BENCHMARKS = ["SPY", "QQQ", "TQQQ"] as const;

function isLightColor(color: string): boolean {
  return color === "#e4e4e7";
}

function benchmarkButtonStyle(color: string) {
  if (isLightColor(color)) {
    return {
      backgroundColor: color,
      color: "#1a1a1a",
      fontWeight: 700,
      boxShadow: `0 0 0 1px ${color}`,
    };
  }
  return {
    backgroundColor: `${color}20`,
    color,
    boxShadow: `0 0 0 1px ${color}66`,
  };
}

export function BenchmarkSelectorRow({
  benchmarks,
  maxBenchmarks,
  showCustomInput,
  customTickerInput,
  catalogDropdownOpen,
  catalogMatches,
  dropdownRef,
  onPresetToggle,
  onOpenCustomInput,
  onInputChange,
  onInputFocus,
  onInputBlur,
  onSubmitCustom,
  onRefreshCatalog,
  onSelectCatalogItem,
  onRemoveBenchmark,
}: Props) {
  return (
    <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground mr-1">Benchmark:</span>
      {PRESET_BENCHMARKS.map((ticker) => {
        const entry = benchmarks.find((benchmark) => benchmark.ticker === ticker);
        const isActive = !!entry;
        return (
          <button
            key={ticker}
            data-testid={`benchmark-${ticker}`}
            data-active={isActive ? "true" : "false"}
            onClick={() => onPresetToggle(ticker)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? isLightColor(entry.color)
                  ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]"
                  : ""
                : benchmarks.length >= maxBenchmarks
                  ? "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
            }`}
            style={
              isActive && !isLightColor(entry.color)
                ? benchmarkButtonStyle(entry.color)
                : undefined
            }
            disabled={!isActive && benchmarks.length >= maxBenchmarks}
          >
            {ticker}
          </button>
        );
      })}

      {!showCustomInput ? (
        <button
          onClick={onOpenCustomInput}
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
        <div className="relative" ref={dropdownRef}>
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitCustom();
            }}
          >
            <input
              autoFocus
              value={customTickerInput}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Symphony name/link or Ticker"
              className="w-56 rounded-md border border-border/50 bg-muted px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
              onFocus={onInputFocus}
              onBlur={onInputBlur}
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
            >
              R
            </button>
          </form>

          {catalogDropdownOpen && catalogMatches.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border/50 bg-card shadow-lg max-h-48 overflow-y-auto">
              {catalogMatches.map((item) => (
                <button
                  key={item.symphony_id}
                  type="button"
                  className="w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-muted/60 flex items-center justify-between gap-2"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectCatalogItem(item.symphony_id);
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
        .filter((benchmark) => !PRESET_BENCHMARKS.includes(benchmark.ticker as (typeof PRESET_BENCHMARKS)[number]))
        .map((benchmark) => (
          <button
            key={benchmark.ticker}
            onClick={() => onRemoveBenchmark(benchmark.ticker)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
              isLightColor(benchmark.color)
                ? "bg-zinc-200 text-zinc-900 font-bold shadow-[0_0_0_1px_#e4e4e7]"
                : ""
            }`}
            style={
              !isLightColor(benchmark.color)
                ? benchmarkButtonStyle(benchmark.color)
                : undefined
            }
          >
            {benchmark.label} x
          </button>
        ))}
    </div>
  );
}
