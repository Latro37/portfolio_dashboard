export type DateScopedAccountQuery = {
  accountId?: string;
  period?: string;
  startDate?: string;
  endDate?: string;
};

export type LiveOverlayQuery = DateScopedAccountQuery & {
  livePv: number;
  liveNd: number;
};

export type TransactionsQuery = {
  accountId?: string;
  symbol?: string;
  limit?: number;
  offset?: number;
};

export type SymphonyScopedQuery = {
  symphonyId: string;
  accountId: string;
};

export type SymphonySummaryQuery = SymphonyScopedQuery & {
  period?: string;
  startDate?: string;
  endDate?: string;
};

export type SymphonyLiveSummaryQuery = SymphonySummaryQuery & {
  livePv: number;
  liveNd: number;
};

export type BenchmarkHistoryQuery = {
  ticker: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
};

function normalize(value?: string): string {
  return value ?? "";
}

export const queryKeys = {
  accounts: () => ["accounts"] as const,
  config: () => ["config"] as const,
  summary: (scope: DateScopedAccountQuery = {}) =>
    [
      "summary",
      normalize(scope.accountId),
      normalize(scope.period),
      normalize(scope.startDate),
      normalize(scope.endDate),
    ] as const,
  summaryLive: (scope: LiveOverlayQuery) =>
    [
      "summary-live",
      normalize(scope.accountId),
      normalize(scope.period),
      normalize(scope.startDate),
      normalize(scope.endDate),
      scope.livePv,
      scope.liveNd,
    ] as const,
  performance: (scope: DateScopedAccountQuery = {}) =>
    [
      "performance",
      normalize(scope.accountId),
      normalize(scope.period),
      normalize(scope.startDate),
      normalize(scope.endDate),
    ] as const,
  holdings: (accountId?: string, date?: string) =>
    ["holdings", normalize(accountId), normalize(date)] as const,
  holdingsHistory: (accountId?: string) =>
    ["holdings-history", normalize(accountId)] as const,
  transactions: (scope: TransactionsQuery = {}) =>
    [
      "transactions",
      normalize(scope.accountId),
      normalize(scope.symbol),
      scope.limit ?? 100,
      scope.offset ?? 0,
    ] as const,
  cashFlows: (accountId?: string) =>
    ["cash-flows", normalize(accountId)] as const,
  syncStatus: (accountId?: string) =>
    ["sync-status", normalize(accountId)] as const,
  symphonyExportJobStatus: () =>
    ["symphony-export-job-status"] as const,
  symphonies: (accountId?: string) =>
    ["symphonies", normalize(accountId)] as const,
  symphonySummary: (scope: SymphonySummaryQuery) =>
    [
      "symphony-summary",
      scope.symphonyId,
      scope.accountId,
      normalize(scope.period),
      normalize(scope.startDate),
      normalize(scope.endDate),
    ] as const,
  symphonySummaryLive: (scope: SymphonyLiveSummaryQuery) =>
    [
      "symphony-summary-live",
      scope.symphonyId,
      scope.accountId,
      normalize(scope.period),
      normalize(scope.startDate),
      normalize(scope.endDate),
      scope.livePv,
      scope.liveNd,
    ] as const,
  symphonyPerformance: (scope: SymphonyScopedQuery) =>
    ["symphony-performance", scope.symphonyId, scope.accountId] as const,
  symphonyBacktest: (scope: SymphonyScopedQuery) =>
    ["symphony-backtest", scope.symphonyId, scope.accountId] as const,
  symphonyAllocations: (scope: SymphonyScopedQuery) =>
    ["symphony-allocations", scope.symphonyId, scope.accountId] as const,
  symphonyTradePreview: (scope: SymphonyScopedQuery) =>
    ["symphony-trade-preview", scope.symphonyId, scope.accountId] as const,
  tradePreview: (accountId?: string) =>
    ["trade-preview", normalize(accountId)] as const,
  benchmarkHistory: (scope: BenchmarkHistoryQuery) =>
    [
      "benchmark-history",
      scope.ticker.toUpperCase(),
      normalize(scope.startDate),
      normalize(scope.endDate),
      normalize(scope.accountId),
    ] as const,
  symphonyCatalog: (refresh = false) =>
    ["symphony-catalog", refresh] as const,
  symphonyBenchmark: (scope: SymphonyScopedQuery) =>
    ["symphony-benchmark", scope.symphonyId, scope.accountId] as const,
};
