const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    console.error(
      `[RATE LIMITED] 429 on ${path} — Retry-After: ${res.headers.get("Retry-After") ?? "unknown"}, body: ${body.slice(0, 500)}`
    );
    throw new Error(`Rate limited on ${path}. Try again later.`);
  }
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
  max_drawdown_date: string | null;
  current_drawdown: number;
  win_rate: number;
  num_wins: number;
  num_losses: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  annualized_volatility: number;
  best_day_pct: number;
  best_day_date: string | null;
  worst_day_pct: number;
  worst_day_date: string | null;
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
  time_weighted_return: number;
  money_weighted_return: number;
  current_drawdown: number;
}

export interface Holding {
  symbol: string;
  quantity: number;
  market_value: number;
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
  account_id?: string;
  account_name?: string;
}

export interface CashFlowRow {
  date: string;
  type: string;
  amount: number;
  description: string;
  account_id?: string;
  account_name?: string;
}

export interface SyncStatus {
  status: string;
  last_sync_date: string | null;
  initial_backfill_done: boolean;
  message: string;
}

export interface AccountInfo {
  id: string;
  credential_name: string;
  account_type: string;
  display_name: string;
  status: string;
}

function _qs(accountId?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (accountId) params.set("account_id", accountId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const api = {
  getAccounts: () => fetchJSON<AccountInfo[]>("/accounts"),
  getSummary: (accountId?: string, period?: string, startDate?: string, endDate?: string) => {
    const params: Record<string, string> = {};
    if (startDate || endDate) {
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
    } else if (period) {
      params.period = period;
    }
    return fetchJSON<Summary>(`/summary${_qs(accountId, Object.keys(params).length ? params : undefined)}`);
  },
  getPerformance: (accountId?: string, period?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("account_id", accountId);
    if (startDate || endDate) {
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
    } else if (period) {
      params.set("period", period);
    }
    const qs = params.toString();
    return fetchJSON<PerformancePoint[]>(qs ? `/performance?${qs}` : "/performance");
  },
  getHoldings: (accountId?: string, date?: string) =>
    fetchJSON<HoldingsResponse>(`/holdings${_qs(accountId, date ? { date } : undefined)}`),
  getTransactions: (accountId?: string, limit = 100, offset = 0, symbol?: string) => {
    const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
    if (symbol) params.symbol = symbol;
    return fetchJSON<{ total: number; transactions: TransactionRow[] }>(
      `/transactions${_qs(accountId, params)}`
    );
  },
  getCashFlows: (accountId?: string) =>
    fetchJSON<CashFlowRow[]>(`/cash-flows${_qs(accountId)}`),
  getSyncStatus: (accountId?: string) =>
    fetchJSON<SyncStatus>(`/sync/status${_qs(accountId)}`),
  triggerSync: (accountId?: string) =>
    fetch(`${API_BASE}/sync${_qs(accountId)}`, { method: "POST" }).then((r) => r.json()),
  addManualCashFlow: (body: {
    account_id: string;
    date: string;
    type: string;
    amount: number;
    description?: string;
  }) =>
    fetch(`${API_BASE}/cash-flows/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
};
