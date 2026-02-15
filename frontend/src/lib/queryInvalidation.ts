import type { QueryClient, QueryKey } from "@tanstack/react-query";

type QueryFamily =
  | "summary"
  | "performance"
  | "holdings"
  | "holdings-history"
  | "transactions"
  | "cash-flows"
  | "sync-status"
  | "symphonies"
  | "symphony-summary"
  | "symphony-summary-live"
  | "symphony-performance"
  | "symphony-backtest"
  | "symphony-allocations"
  | "symphony-trade-preview"
  | "trade-preview"
  | "benchmark-history"
  | "symphony-benchmark"
  | "symphony-catalog"
  | "config"
  | "accounts";

function familyFromKey(key: QueryKey): QueryFamily | null {
  const prefix = key[0];
  return typeof prefix === "string" ? (prefix as QueryFamily) : null;
}

function accountMatches(key: QueryKey, accountId: string): boolean {
  if (key.length < 2) return false;
  const value = key[1];
  return typeof value === "string" && value === accountId;
}

async function invalidateFamilies(
  queryClient: QueryClient,
  families: QueryFamily[],
  accountId?: string,
) {
  const unique = [...new Set(families)];
  await Promise.all(
    unique.map((family) =>
      queryClient.invalidateQueries({
        predicate: (query) => {
          if (familyFromKey(query.queryKey) !== family) return false;
          if (!accountId) return true;
          return accountMatches(query.queryKey, accountId);
        },
      }),
    ),
  );
}

export async function invalidateAfterSync(queryClient: QueryClient, accountId?: string) {
  await invalidateFamilies(
    queryClient,
    [
      "summary",
      "performance",
      "holdings",
      "holdings-history",
      "transactions",
      "cash-flows",
      "sync-status",
      "symphonies",
      "symphony-summary",
      "symphony-summary-live",
      "symphony-performance",
      "symphony-backtest",
      "symphony-allocations",
      "symphony-trade-preview",
      "trade-preview",
      "symphony-catalog",
    ],
    accountId,
  );
}

export async function invalidateAfterManualCashFlow(
  queryClient: QueryClient,
  accountId: string,
) {
  await invalidateFamilies(
    queryClient,
    ["summary", "performance", "cash-flows", "transactions", "sync-status"],
    accountId,
  );
}

export async function invalidateAfterConfigWrite(queryClient: QueryClient) {
  await invalidateFamilies(queryClient, ["config"]);
}
