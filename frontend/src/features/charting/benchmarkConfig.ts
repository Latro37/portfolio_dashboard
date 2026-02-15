export const MAX_BENCHMARKS = 10;

export const BENCHMARK_COLORS = [
  "#f97316",
  "#e4e4e7",
  "#ec4899",
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f43f5e",
  "#14b8a6",
  "#eab308",
  "#fb7185",
] as const;

export function pickBenchmarkColor(usedColors: string[]): string {
  return (
    BENCHMARK_COLORS.find((candidate) => !usedColors.includes(candidate)) ||
    BENCHMARK_COLORS[usedColors.length % BENCHMARK_COLORS.length]
  );
}
