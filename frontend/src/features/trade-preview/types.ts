import type { TradePreviewItem } from "@/lib/api";

export interface TradePreviewProps {
  accountId?: string;
  portfolioValue?: number;
  onSymphonyClick?: (symphonyId: string) => void;
  autoRefreshEnabled?: boolean;
  finnhubConfigured?: boolean;
}

export interface PriceQuote {
  price: number;
  change: number;
  changePct: number;
}

export interface SymphonyBreakdown {
  id: string;
  name: string;
  notional: number;
  quantity: number;
  prevWeight: number;
  nextWeight: number;
}

export interface GroupedRow {
  ticker: string;
  side: "BUY" | "SELL";
  totalNotional: number;
  totalQuantity: number;
  totalPrevValue: number;
  symphonies: SymphonyBreakdown[];
}

export type TradePreviewList = TradePreviewItem[];
