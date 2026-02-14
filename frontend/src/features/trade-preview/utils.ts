import type { TradePreviewItem } from "@/lib/api";
import type { GroupedRow, SymphonyBreakdown } from "@/features/trade-preview/types";

export function formatTradeDollar(value: number): string {
  return "$" + Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function groupTradePreviewRows(trades: TradePreviewItem[]): GroupedRow[] {
  const map = new Map<string, GroupedRow>();

  for (const trade of trades) {
    const key = `${trade.ticker}|${trade.side}`;
    const existing = map.get(key);
    const breakdown: SymphonyBreakdown = {
      id: trade.symphony_id,
      name: trade.symphony_name,
      notional: trade.notional,
      quantity: trade.quantity,
      prevWeight: trade.prev_weight,
      nextWeight: trade.next_weight,
    };

    if (existing) {
      existing.totalNotional += trade.notional;
      existing.totalQuantity += trade.quantity;
      existing.totalPrevValue += trade.prev_value;

      const already = existing.symphonies.find(
        (symphony) => symphony.id === trade.symphony_id,
      );
      if (already) {
        already.notional += trade.notional;
        already.quantity += trade.quantity;
      } else {
        existing.symphonies.push(breakdown);
      }
    } else {
      map.set(key, {
        ticker: trade.ticker,
        side: trade.side,
        totalNotional: trade.notional,
        totalQuantity: trade.quantity,
        totalPrevValue: trade.prev_value,
        symphonies: [breakdown],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.side !== b.side) return a.side === "SELL" ? -1 : 1;
    return Math.abs(b.totalNotional) - Math.abs(a.totalNotional);
  });
}
