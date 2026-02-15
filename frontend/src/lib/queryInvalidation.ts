import type { QueryClient, QueryKey } from "@tanstack/react-query";

type QueryFamily =
  | "summary"
  | "summary-live"
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

function accountIndexForFamily(family: QueryFamily): number | null {
  switch (family) {
    case "summary":
    case "summary-live":
    case "performance":
    case "holdings":
    case "holdings-history":
    case "transactions":
    case "cash-flows":
    case "sync-status":
    case "symphonies":
    case "trade-preview":
      return 1;
    case "symphony-summary":
    case "symphony-summary-live":
    case "symphony-performance":
    case "symphony-backtest":
    case "symphony-allocations":
    case "symphony-trade-preview":
    case "symphony-benchmark":
      return 2;
    case "benchmark-history":
      return 4;
    default:
      return null;
  }
}

function accountMatches(family: QueryFamily, key: QueryKey, accountId: string): boolean {
  const accountIndex = accountIndexForFamily(family);
  if (accountIndex == null || key.length <= accountIndex) return true;
  const value = key[accountIndex];
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
          return accountMatches(family, query.queryKey, accountId);
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
      "summary-live",
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
      "symphony-benchmark",
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
