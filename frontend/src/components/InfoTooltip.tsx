"use client";

import { Info } from "lucide-react";

interface Props {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: Props) {
  return (
    <span className={`relative group/tip inline-flex ${className || ""}`}>
      <Info className="h-3.5 w-3.5 text-foreground/40 cursor-help" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-foreground w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-10">
        {text}
      </span>
    </span>
  );
}

export const TWR_TOOLTIP_TEXT =
  "Time Weighted Return measures portfolio growth independent of cash flows such as deposits. Each day's gain/loss is compounded together to show how the strategy itself performed. Measures the performance of the strategy, not the timing of entry or exit.";
