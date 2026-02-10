"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";

interface Props {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className={`inline-flex ${className || ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <Info className="h-3.5 w-3.5 text-foreground/40 cursor-help" />
      {pos && (
        <span
          className="fixed px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-foreground w-64 text-left pointer-events-none z-50 normal-case tracking-normal font-normal"
          style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%) translateY(-6px)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export const TWR_TOOLTIP_TEXT =
  "Time Weighted Return measures portfolio growth independent of cash flows such as deposits. Each day's gain/loss is compounded together to show how the strategy itself performed. Measures the performance of the strategy, not the timing of entry or exit.";
