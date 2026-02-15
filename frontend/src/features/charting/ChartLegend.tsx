type LegendItem = {
  label: string;
  color: string;
};

type Props = {
  items: LegendItem[];
};

export function ChartLegend({ items }: Props) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs text-zinc-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
