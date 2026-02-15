import type { BenchmarkEntry } from "@/lib/api";
import type { ChartSeriesPoint } from "@/features/charting/types";

type TooltipEntry = {
  dataKey?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
};

type TooltipFormatters = {
  formatDate: (value: string) => string;
  formatValue: (value: number) => string;
  formatPct: (value: number) => string;
};

type OverlayRendererArgs = {
  tradingData: ChartSeriesPoint[];
  benchmarks: BenchmarkEntry[];
  singleBenchmark: boolean;
  showOverlay: boolean;
  overlayColor: string;
  primaryKey: string;
  primaryLabel: string;
  primaryLabelWhenOverlay?: string;
  overlayKey?: string;
  overlayLabel: string;
  benchmarkSuffix: string;
  formatters: TooltipFormatters;
};

type PortfolioRendererArgs = {
  tradingData: ChartSeriesPoint[];
  formatters: TooltipFormatters;
};

type MwrRendererArgs = {
  tradingData: ChartSeriesPoint[];
  benchmarks: BenchmarkEntry[];
  singleBenchmark: boolean;
  hasBenchmark: boolean;
  formatters: TooltipFormatters;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deltaColor(delta: number): string {
  return delta >= 0 ? "#10b981" : "#ef4444";
}

function formatDelta(delta: number, formatPct: (value: number) => string): string {
  return `${delta >= 0 ? "+" : ""}${formatPct(delta)}`;
}

function getPointValue(point: ChartSeriesPoint | null, key: string) {
  return toFiniteNumber(point?.[key]);
}

export function createOverlayTooltipRenderer({
  tradingData,
  benchmarks,
  singleBenchmark,
  showOverlay,
  overlayColor,
  primaryKey,
  primaryLabel,
  primaryLabelWhenOverlay,
  overlayKey,
  overlayLabel,
  benchmarkSuffix,
  formatters,
}: OverlayRendererArgs) {
  const multiLine = (showOverlay && !!overlayKey) || benchmarks.length > 0;

  return function OverlayTooltipContent({
    active,
    payload,
    label,
  }: ChartTooltipProps) {
    if (!active || !payload?.length || label == null) return null;

    const labelText = String(label);
    const index = tradingData.findIndex((point) => point.date === labelText);
    const prevPoint = index > 0 ? tradingData[index - 1] : null;
    const primaryEntry = payload.find((entry) => entry.dataKey === primaryKey);
    const overlayEntry = payload.find((entry) => entry.dataKey === overlayKey);
    const primaryValue = toFiniteNumber(primaryEntry?.value);
    const overlayValue = toFiniteNumber(overlayEntry?.value);
    const hasBoth = primaryValue != null && overlayValue != null;
    const overlayDelta = hasBoth ? primaryValue - overlayValue : null;
    const prevPrimaryValue = prevPoint ? getPointValue(prevPoint, primaryKey) : null;
    const primaryDayDelta =
      primaryValue != null && prevPrimaryValue != null
        ? primaryValue - prevPrimaryValue
        : null;
    const primaryDayColor =
      primaryDayDelta != null ? deltaColor(primaryDayDelta) : "#71717a";
    const overlayDeltaColor = overlayDelta != null ? deltaColor(overlayDelta) : "#71717a";

    return (
      <div
        key={labelText}
        style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: 8,
          fontSize: 13,
          padding: "10px 14px",
        }}
      >
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>
          {formatters.formatDate(labelText)}
        </p>
        {primaryValue != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>
              {showOverlay && overlayKey
                ? (primaryLabelWhenOverlay || "Live")
                : primaryLabel} :{" "}
              {formatters.formatPct(primaryValue)}
            </p>
            {!multiLine && primaryDayDelta != null && (
              <p
                key={`pd-${primaryDayColor}`}
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: primaryDayColor,
                }}
              >
                Δ to Prev. Day: {formatDelta(primaryDayDelta, formatters.formatPct)}
              </p>
            )}
          </div>
        )}
        {showOverlay && overlayValue != null && (
          <div>
            <p style={{ margin: 0, lineHeight: 1.6, color: overlayColor }}>
              {overlayLabel} : {formatters.formatPct(overlayValue)}
            </p>
          </div>
        )}
        {showOverlay && overlayDelta != null && (
          <p
            key={`dl-${overlayDeltaColor}`}
            style={{
              margin: 0,
              lineHeight: 1.6,
              marginTop: 2,
              color: overlayDeltaColor,
            }}
          >
            Δ: {formatDelta(overlayDelta, formatters.formatPct)}
          </p>
        )}
        {benchmarks.map((benchmark, index) => {
          const benchmarkEntry = payload.find(
            (entry) => entry.dataKey === `bench_${index}_${benchmarkSuffix}`,
          );
          const benchmarkValue = toFiniteNumber(benchmarkEntry?.value);
          if (benchmarkValue == null) return null;

          return (
            <div key={benchmark.ticker}>
              <p style={{ margin: 0, lineHeight: 1.6, color: benchmark.color }}>
                {benchmark.label} : {formatters.formatPct(benchmarkValue)}
              </p>
              {singleBenchmark && primaryValue != null && (
                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.6,
                    marginTop: 2,
                    color:
                      primaryValue - benchmarkValue >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  Δ:{" "}
                  {formatDelta(primaryValue - benchmarkValue, formatters.formatPct)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };
}

export function createPortfolioTooltipRenderer({
  tradingData,
  formatters,
}: PortfolioRendererArgs) {
  return function PortfolioTooltipContent({
    active,
    payload,
    label,
  }: ChartTooltipProps) {
    if (!active || !payload?.length || label == null) return null;

    const labelText = String(label);
    const index = tradingData.findIndex((point) => point.date === labelText);
    const prevPoint = index > 0 ? tradingData[index - 1] : null;

    return (
      <div
        key={labelText}
        style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: 8,
          fontSize: 13,
          padding: "10px 14px",
        }}
      >
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>
          {formatters.formatDate(labelText)}
        </p>
        {payload.map((entry, indexInPayload) => {
          const value = toFiniteNumber(entry.value);
          if (value == null) return null;

          const dataKey = typeof entry.dataKey === "string" ? entry.dataKey : "";
          const isDeposits = dataKey === "net_deposits";
          const name = dataKey === "portfolio_value" ? "Portfolio" : "Deposits";
          const prevValue = dataKey ? getPointValue(prevPoint, dataKey) : null;
          const dayDelta =
            !isDeposits && prevValue != null && prevValue !== 0
              ? ((value - prevValue) / prevValue) * 100
              : null;
          const dayColor = dayDelta != null ? deltaColor(dayDelta) : "#71717a";

          return (
            <div key={`${dataKey || "series"}-${indexInPayload}`}>
              <p
                style={{
                  margin: 0,
                  lineHeight: 1.6,
                  color: entry.color || "#e4e4e7",
                }}
              >
                {name} : {formatters.formatValue(value)}
              </p>
              {dayDelta != null && (
                <p
                  key={`pfd-${dayColor}`}
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: dayColor,
                  }}
                >
                  Δ to Prev. Day: {formatDelta(dayDelta, formatters.formatPct)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };
}

export function createMwrTooltipRenderer({
  tradingData,
  benchmarks,
  singleBenchmark,
  hasBenchmark,
  formatters,
}: MwrRendererArgs) {
  return function MwrTooltipContent({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length || label == null) return null;

    const labelText = String(label);
    const index = tradingData.findIndex((point) => point.date === labelText);
    const prevPoint = index > 0 ? tradingData[index - 1] : null;
    const mwrEntry = payload.find(
      (entry) => entry.dataKey === "money_weighted_return",
    );
    const value = toFiniteNumber(mwrEntry?.value);
    const prevValue = prevPoint
      ? toFiniteNumber(prevPoint.money_weighted_return)
      : null;
    const dayDelta = value != null && prevValue != null ? value - prevValue : null;
    const dayColor = dayDelta != null ? deltaColor(dayDelta) : "#71717a";

    return (
      <div
        key={labelText}
        style={{
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: 8,
          fontSize: 13,
          padding: "10px 14px",
        }}
      >
        <p style={{ margin: "0 0 4px", color: "#e4e4e7" }}>
          {formatters.formatDate(labelText)}
        </p>
        {value != null && (
          <>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#e4e4e7" }}>
              MWR : {formatters.formatPct(value)}
            </p>
            {!hasBenchmark && dayDelta != null && (
              <p
                key={`md-${dayColor}`}
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: dayColor,
                }}
              >
                Δ to Prev. Day: {formatDelta(dayDelta, formatters.formatPct)}
              </p>
            )}
          </>
        )}
        {benchmarks.map((benchmark, indexInBenchmarks) => {
          const benchmarkEntry = payload.find(
            (entry) => entry.dataKey === `bench_${indexInBenchmarks}_mwr`,
          );
          const benchmarkValue = toFiniteNumber(benchmarkEntry?.value);
          if (benchmarkValue == null) return null;

          return (
            <div key={benchmark.ticker}>
              <p style={{ margin: 0, lineHeight: 1.6, color: benchmark.color }}>
                {benchmark.label} : {formatters.formatPct(benchmarkValue)}
              </p>
              {singleBenchmark && value != null && (
                <p
                  style={{
                    margin: 0,
                    lineHeight: 1.6,
                    marginTop: 2,
                    color: value - benchmarkValue >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  Δ: {formatDelta(value - benchmarkValue, formatters.formatPct)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };
}
