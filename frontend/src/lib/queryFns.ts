import type { UseQueryOptions } from "@tanstack/react-query";

import {
  api,
  type AccountInfo,
  type AppConfig,
  type BenchmarkHistory,
  type CashFlowRow,
  type HoldingsResponse,
  type PerformancePoint,
  type Summary,
  type SymphonyExportJobStatus,
  type SymphonyBacktest,
  type SymphonyBenchmarkHistory,
  type SymphonyCatalogItem,
  type SymphonyInfo,
  type SymphonySummary,
  type SymphonyTradePreview,
  type TradePreviewItem,
  type TransactionRow,
} from "@/lib/api";
import type {
  BenchmarkHistoryQuery,
  DateScopedAccountQuery,
  LiveOverlayQuery,
  SymphonyScopedQuery,
  SymphonySummaryQuery,
  SymphonyLiveSummaryQuery,
  TransactionsQuery,
} from "@/lib/queryKeys";

export const queryRetryOverrides = {
  symphonyBacktest: { retry: 0 as const },
  symphonyBenchmark: { retry: 0 as const },
};

export function getConfigQueryFn(): Promise<AppConfig> {
  return api.getConfig();
}

export function getAccountsQueryFn(): Promise<AccountInfo[]> {
  return api.getAccounts();
}

export function getSummaryQueryFn(scope: DateScopedAccountQuery): Promise<Summary> {
  return api.getSummary(scope.accountId, scope.period, scope.startDate, scope.endDate);
}

export function getSummaryLiveQueryFn(scope: LiveOverlayQuery): Promise<Summary> {
  return api.getLiveSummary(
    scope.accountId ?? "",
    scope.livePv,
    scope.liveNd,
    scope.period,
    scope.startDate,
    scope.endDate,
  );
}

export function getPerformanceQueryFn(scope: DateScopedAccountQuery): Promise<PerformancePoint[]> {
  return api.getPerformance(scope.accountId, scope.period, scope.startDate, scope.endDate);
}

export function getHoldingsQueryFn(accountId?: string, date?: string): Promise<HoldingsResponse> {
  return api.getHoldings(accountId, date);
}

export function getTransactionsQueryFn(
  params: TransactionsQuery,
): Promise<{ total: number; transactions: TransactionRow[] }> {
  return api.getTransactions(params.accountId, params.limit, params.offset, params.symbol);
}

export function getCashFlowsQueryFn(accountId?: string): Promise<CashFlowRow[]> {
  return api.getCashFlows(accountId);
}

export function getSyncStatusQueryFn(accountId?: string) {
  return api.getSyncStatus(accountId);
}

export function getSymphonyExportJobStatusQueryFn(): Promise<SymphonyExportJobStatus> {
  return api.getSymphonyExportJobStatus();
}

export function getSymphoniesQueryFn(accountId?: string): Promise<SymphonyInfo[]> {
  return api.getSymphonies(accountId);
}

export function getSymphonySummaryQueryFn(scope: SymphonySummaryQuery): Promise<SymphonySummary> {
  return api.getSymphonySummary(
    scope.symphonyId,
    scope.accountId,
    scope.period,
    scope.startDate,
    scope.endDate,
  );
}

export function getSymphonySummaryLiveQueryFn(
  scope: SymphonyLiveSummaryQuery,
): Promise<SymphonySummary> {
  return api.getSymphonyLiveSummary(
    scope.symphonyId,
    scope.accountId,
    scope.livePv,
    scope.liveNd,
    scope.period,
    scope.startDate,
    scope.endDate,
  );
}

export function getSymphonyPerformanceQueryFn(scope: SymphonyScopedQuery): Promise<PerformancePoint[]> {
  return api.getSymphonyPerformance(scope.symphonyId, scope.accountId);
}

export function getSymphonyBacktestQueryFn(
  scope: SymphonyScopedQuery,
  forceRefresh = false,
): Promise<SymphonyBacktest> {
  return api.getSymphonyBacktest(scope.symphonyId, scope.accountId, forceRefresh);
}

export function getSymphonyAllocationsQueryFn(scope: SymphonyScopedQuery) {
  return api.getSymphonyAllocations(scope.symphonyId, scope.accountId);
}

export function getSymphonyTradePreviewQueryFn(scope: SymphonyScopedQuery): Promise<SymphonyTradePreview> {
  return api.getSymphonyTradePreview(scope.symphonyId, scope.accountId);
}

export function getTradePreviewQueryFn(accountId?: string): Promise<TradePreviewItem[]> {
  return api.getTradePreview(accountId);
}

export function getBenchmarkHistoryQueryFn(scope: BenchmarkHistoryQuery): Promise<BenchmarkHistory> {
  return api.getBenchmarkHistory(scope.ticker, scope.startDate, scope.endDate, scope.accountId);
}

export function getSymphonyCatalogQueryFn(refresh = false): Promise<SymphonyCatalogItem[]> {
  return api.getSymphonyCatalog(refresh);
}

export function getSymphonyBenchmarkQueryFn(symphonyId: string): Promise<SymphonyBenchmarkHistory> {
  return api.getSymphonyBenchmark(symphonyId);
}

export function noRetryQueryOptions<TData>(): Pick<
  UseQueryOptions<TData, Error, TData>,
  "retry"
> {
  return { retry: 0 };
}
