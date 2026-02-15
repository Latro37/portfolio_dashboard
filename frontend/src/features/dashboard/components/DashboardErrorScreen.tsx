import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  error: string;
  isTestMode: boolean;
  syncing: boolean;
  onSync: () => void;
};

export function DashboardErrorScreen({
  error,
  isTestMode,
  syncing,
  onSync,
}: Props) {
  const needsSync = error.includes("404") || error.includes("sync");

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {needsSync ? "No portfolio data yet" : "Something went wrong"}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {needsSync
            ? isTestMode
              ? "No test data was found. Seed the test database (basic/power profile), then reload."
              : "Click the button below to fetch your portfolio history from Composer. This may take up to a minute on the first run."
            : error}
        </p>
      </div>

      {!isTestMode && needsSync && (
        <Button onClick={onSync} disabled={syncing}>
          {syncing ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? "Syncing..." : "Initial Sync"}
        </Button>
      )}
    </div>
  );
}
