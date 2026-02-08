const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export interface Summary {
  portfolio_value: number;
  net_deposits: number;
  total_return_dollars: number;
  daily_return_pct: number;
  cumulative_return_pct: number;
  cagr: number;
  time_weighted_return: number;
  money_weighted_return: number;
  sharpe_ratio: number;
  calmar_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  current_drawdown: number;
  win_rate: number;
  num_wins: number;
  num_losses: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  annualized_volatility: number;
  best_day_pct: number;
  worst_day_pct: number;
  profit_factor: number;
  total_fees: number;
  total_dividends: number;
  last_updated: string | null;
}

export interface PerformancePoint {
  date: string;
  portfolio_value: number;
  net_deposits: number;
  cumulative_return_pct: number;
  daily_return_pct: number;
}

export interface Holding {
  symbol: string;
  quantity: number;
  allocation_pct: number;
}

export interface HoldingsResponse {
  date: string;
  holdings: Holding[];
}

export interface TransactionRow {
  date: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  total_amount: number;
}

export interface CashFlowRow {
  date: string;
  type: string;
  amount: number;
  description: string;
}

export interface SyncStatus {
  status: string;
  last_sync_date: string | null;
  initial_backfill_done: boolean;
  message: string;
}

export const api = {
  getSummary: () => fetchJSON<Summary>("/summary"),
  getPerformance: (period?: string) =>
    fetchJSON<PerformancePoint[]>(period ? `/performance?period=${period}` : "/performance"),
  getHoldings: (date?: string) =>
    fetchJSON<HoldingsResponse>(date ? `/holdings?date=${date}` : "/holdings"),
  getTransactions: (limit = 100, offset = 0, symbol?: string) => {
    let url = `/transactions?limit=${limit}&offset=${offset}`;
    if (symbol) url += `&symbol=${symbol}`;
    return fetchJSON<{ total: number; transactions: TransactionRow[] }>(url);
  },
  getCashFlows: () => fetchJSON<CashFlowRow[]>("/cash-flows"),
  getSyncStatus: () => fetchJSON<SyncStatus>("/sync/status"),
  triggerSync: () =>
    fetch(`${API_BASE}/sync`, { method: "POST" }).then((r) => r.json()),
};
