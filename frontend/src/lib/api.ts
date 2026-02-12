const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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
  annualized_return: number;
  annualized_return_cum: number;
  time_weighted_return: number;
  money_weighted_return: number;
  money_weighted_return_period: number;
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

export interface SymphonyHolding {
  ticker: string;
  allocation: number;
  value: number;
  last_percent_change: number;
}

export interface SymphonyInfo {
  id: string;
  position_id: string;
  account_id: string;
  account_name: string;
  name: string;
  color: string;
  value: number;
  net_deposits: number;
  cash: number;
  total_return: number;
  cumulative_return_pct: number;
  simple_return: number;
  time_weighted_return: number;
  last_dollar_change: number;
  last_percent_change: number;
  sharpe_ratio: number;
  max_drawdown: number;
  annualized_return: number;
  invested_since: string;
  last_rebalance_on: string | null;
  next_rebalance_on: string | null;
  rebalance_frequency: string;
  holdings: SymphonyHolding[];
}

export interface SymphonySummary {
  symphony_id: string;
  account_id: string;
  period: string;
  start_date: string;
  end_date: string;
  portfolio_value: number;
  net_deposits: number;
  total_return_dollars: number;
  cumulative_return_pct: number;
  time_weighted_return: number;
  money_weighted_return: number;
  money_weighted_return_period: number;
  cagr: number;
  annualized_return: number;
  annualized_return_cum: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  current_drawdown: number;
  annualized_volatility: number;
  win_rate: number;
  num_wins: number;
  num_losses: number;
  best_day_pct: number;
  worst_day_pct: number;
  profit_factor: number;
  daily_return_pct: number;
}

export interface BacktestSummaryMetrics {
  cumulative_return_pct: number;
  annualized_return: number;
  annualized_return_cum: number;
  time_weighted_return: number;
  cagr: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  annualized_volatility: number;
  win_rate: number;
  best_day_pct: number;
  worst_day_pct: number;
  profit_factor: number;
  median_drawdown: number;
  longest_drawdown_days: number;
  median_drawdown_days: number;
}

export interface SymphonyBacktest {
  stats: Record<string, number>;
  dvm_capital: Record<string, Record<string, number>>;
  tdvm_weights: Record<string, Record<string, number>>;
  benchmarks: Record<string, Record<string, number>>;
  summary_metrics: BacktestSummaryMetrics;
  first_day: number;
  last_market_day: number;
  cached_at: string;
}

export interface TradePreviewItem {
  symphony_id: string;
  symphony_name: string;
  account_id: string;
  account_name: string;
  ticker: string;
  notional: number;
  quantity: number;
  prev_value: number;
  prev_weight: number;
  next_weight: number;
  side: "BUY" | "SELL";
}

export interface SymphonyTradePreviewTrade {
  ticker: string;
  name: string | null;
  side: string;
  share_change: number;
  cash_change: number;
  average_price: number;
  prev_value: number;
  prev_weight: number;
  next_weight: number;
}

export interface SymphonyTradePreview {
  symphony_id: string;
  symphony_name: string;
  rebalanced: boolean;
  next_rebalance_after: string;
  symphony_value: number;
  recommended_trades: SymphonyTradePreviewTrade[];
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

export interface BenchmarkPoint {
  date: string;
  close: number;
  return_pct: number;
  drawdown_pct: number;
  mwr_pct: number;
}

export interface BenchmarkHistory {
  ticker: string;
  data: BenchmarkPoint[];
}

export interface SymphonyExportStatus {
  local_path: string;
}

export interface ScreenshotConfig {
  enabled: boolean;
  local_path: string;
  account_id: string;
  chart_mode: string;
  period: string;
  custom_start: string;
  hide_portfolio_value: boolean;
  metrics: string[];
}

export interface AppConfig {
  finnhub_api_key: string | null;
  symphony_export: SymphonyExportStatus | null;
  screenshot: ScreenshotConfig | null;
}

export const api = {
  getConfig: () => fetchJSON<AppConfig>("/config"),
  saveSymphonyExportPath: (localPath: string) =>
    fetch(`${API_BASE}/config/symphony-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_path: localPath }),
    }).then((r) => { if (!r.ok) throw new Error(`Failed: ${r.status}`); return r.json(); }),
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
    fetch(`${API_BASE}/sync${_qs(accountId)}`, { method: "POST" })
      .then((r) => r.json()),
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
  getSymphonies: (accountId?: string) =>
    fetchJSON<SymphonyInfo[]>(`/symphonies${_qs(accountId)}`),
  getSymphonyPerformance: (symphonyId: string, accountId: string) =>
    fetchJSON<PerformancePoint[]>(
      `/symphonies/${symphonyId}/performance?account_id=${encodeURIComponent(accountId)}`
    ),
  getSymphonyBacktest: (symphonyId: string, accountId: string, forceRefresh = false) =>
    fetchJSON<SymphonyBacktest>(
      `/symphonies/${symphonyId}/backtest?account_id=${encodeURIComponent(accountId)}${forceRefresh ? "&force_refresh=true" : ""}`
    ),
  getSymphonySummary: (symphonyId: string, accountId: string, period?: string, startDate?: string, endDate?: string) =>
    fetchJSON<SymphonySummary>(
      `/symphonies/${symphonyId}/summary?account_id=${encodeURIComponent(accountId)}${period ? `&period=${period}` : ""}${startDate ? `&start_date=${startDate}` : ""}${endDate ? `&end_date=${endDate}` : ""}`
    ),
  getSymphonyAllocations: (symphonyId: string, accountId: string) =>
    fetchJSON<Record<string, Record<string, number>>>(
      `/symphonies/${symphonyId}/allocations?account_id=${encodeURIComponent(accountId)}`
    ),
  getTradePreview: (accountId?: string) =>
    fetchJSON<TradePreviewItem[]>(`/trade-preview${_qs(accountId)}`),
  getSymphonyTradePreview: (symphonyId: string, accountId: string) =>
    fetchJSON<SymphonyTradePreview>(
      `/symphonies/${symphonyId}/trade-preview?account_id=${encodeURIComponent(accountId)}`
    ),
  getLiveSummary: (accountId: string, livePv: number, liveNd: number, period?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    params.set("account_id", accountId);
    params.set("live_pv", String(livePv));
    params.set("live_nd", String(liveNd));
    if (startDate || endDate) {
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
    } else if (period) {
      params.set("period", period);
    }
    return fetchJSON<Summary>(`/summary/live?${params.toString()}`);
  },
  saveScreenshotConfig: (config: ScreenshotConfig) =>
    fetch(`${API_BASE}/config/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).then((r) => { if (!r.ok) throw new Error(`Failed: ${r.status}`); return r.json(); }),
  uploadScreenshot: (blob: Blob, dateStr: string) => {
    const form = new FormData();
    form.append("file", blob, `Snapshot_${dateStr}.png`);
    form.append("date", dateStr);
    return fetch(`${API_BASE}/screenshot`, { method: "POST", body: form })
      .then((r) => { if (!r.ok) throw new Error(`Failed: ${r.status}`); return r.json(); });
  },
  getBenchmarkHistory: (ticker: string, startDate?: string, endDate?: string, accountId?: string) => {
    const params = new URLSearchParams({ ticker });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (accountId) params.set("account_id", accountId);
    return fetchJSON<BenchmarkHistory>(`/benchmark-history?${params.toString()}`);
  },
  getSymphonyLiveSummary: (symphonyId: string, accountId: string, livePv: number, liveNd: number, period?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    params.set("account_id", accountId);
    params.set("live_pv", String(livePv));
    params.set("live_nd", String(liveNd));
    if (startDate || endDate) {
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
    } else if (period) {
      params.set("period", period);
    }
    return fetchJSON<SymphonySummary>(`/symphonies/${symphonyId}/summary/live?${params.toString()}`);
  },
};
