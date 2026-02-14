type Props = {
  benchmarkLabels: string[];
};

export function BenchmarkControls({ benchmarkLabels }: Props) {
  if (!benchmarkLabels.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {benchmarkLabels.map((label) => (
        <span
          key={label}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
