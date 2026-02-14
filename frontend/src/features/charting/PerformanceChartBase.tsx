import type { ReactNode } from "react";

type Props = {
  title?: string;
  controls?: ReactNode;
  children: ReactNode;
};

export function PerformanceChartBase({ title, controls, children }: Props) {
  return (
    <div className="space-y-4">
      {(title || controls) && (
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
          {controls}
        </div>
      )}
      {children}
    </div>
  );
}
