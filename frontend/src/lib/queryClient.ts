import { QueryClient } from "@tanstack/react-query";

export const NO_RETRY_QUERY_PREFIXES = ["symphony-backtest", "symphony-benchmark"] as const;

export function shouldDisableRetryForKey(queryKey: readonly unknown[]): boolean {
  const prefix = queryKey[0];
  return (
    typeof prefix === "string" &&
    NO_RETRY_QUERY_PREFIXES.includes(
      prefix as (typeof NO_RETRY_QUERY_PREFIXES)[number],
    )
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        gcTime: 600000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const queryClient = createQueryClient();
