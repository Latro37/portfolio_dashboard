import { RefreshCw } from "lucide-react";

export function DashboardLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center">
      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
