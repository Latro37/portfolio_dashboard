import type {
  SnapshotBenchmark,
  SnapshotChartMode,
} from "@/features/dashboard/snapshot/types";

type Props = {
  benchmarks: SnapshotBenchmark[];
  chartMode: SnapshotChartMode;
};

export function SnapshotBenchmarkLegend({
  benchmarks,
  chartMode,
}: Props) {
  if (benchmarks.length === 0 || chartMode === "portfolio") return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 8,
      }}
    >
      <span style={{ fontSize: 12, color: "#71717a" }}>
        Benchmark{benchmarks.length > 1 ? "s" : ""}:
      </span>
      {benchmarks.map((benchmark) => (
        <span
          key={benchmark.ticker}
          style={{
            display: "inline-block",
            backgroundColor: `${benchmark.color}20`,
            color: benchmark.color,
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 6,
            border: `1px solid ${benchmark.color}66`,
          }}
        >
          {benchmark.ticker}
        </span>
      ))}
    </div>
  );
}
