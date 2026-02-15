import { Button } from "@/components/ui/button";

type Props = {
  isTestMode: boolean;
  composerConfigError: string | null;
};

export function DashboardSetupScreen({ isTestMode, composerConfigError }: Props) {
  if (isTestMode) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">No test data yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            No test data was found. Seed the test database (basic/power profile), then reload.
          </p>
        </div>

        <div className="w-full max-w-2xl rounded-md border bg-card p-4 text-left text-sm text-muted-foreground">
          <div className="whitespace-pre-line font-mono">
            powershell -ExecutionPolicy Bypass -File scripts/run-local-tests.ps1 -Profile basic
          </div>
        </div>

        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Setup required</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The dashboard is running, but it cannot connect to Composer yet.
        </p>
      </div>

      <div className="w-full max-w-2xl rounded-md border bg-card p-4 text-left text-sm text-muted-foreground">
        <div className="whitespace-pre-line">
          {composerConfigError ??
            "No accounts were discovered. Check config.json and restart the app."}
        </div>
      </div>

      <div className="w-full max-w-2xl space-y-2 text-left text-sm text-muted-foreground">
        <div>Fix:</div>
        <div>1) Copy config.json.example to config.json</div>
        <div>2) Update composer_accounts[*].api_key_id and api_secret in config.json</div>
        <div>3) Restart: python start.py</div>
      </div>

      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}

