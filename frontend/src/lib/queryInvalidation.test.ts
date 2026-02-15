import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { invalidateAfterManualCashFlow } from "@/lib/queryInvalidation";
import { queryKeys } from "@/lib/queryKeys";

describe("query invalidation contracts", () => {
  test("manual cash-flow invalidates benchmark history for the same account only", async () => {
    const queryClient = new QueryClient();
    const sameAccountKey = queryKeys.benchmarkHistory({
      ticker: "SPY",
      accountId: "acct-1",
    });
    const otherAccountKey = queryKeys.benchmarkHistory({
      ticker: "SPY",
      accountId: "acct-2",
    });

    queryClient.setQueryData(sameAccountKey, { data: [] });
    queryClient.setQueryData(otherAccountKey, { data: [] });

    await invalidateAfterManualCashFlow(queryClient, "acct-1");

    expect(queryClient.getQueryState(sameAccountKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherAccountKey)?.isInvalidated).toBe(false);
  });
});
