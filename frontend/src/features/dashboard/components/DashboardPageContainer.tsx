"use client";

import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { AccountSwitcher } from "@/components/AccountSwitcher";
import { DetailTabs } from "@/components/DetailTabs";
import { HelpModal } from "@/components/HelpModal";
import { HoldingsList } from "@/components/HoldingsList";
import { HoldingsPie } from "@/components/HoldingsPie";
import { MetricCards } from "@/components/MetricCards";
import { PerformanceChart } from "@/components/PerformanceChart";
import { PortfolioHeader } from "@/components/PortfolioHeader";
import { SettingsModal } from "@/components/SettingsModal";
import { SnapshotView, DEFAULT_METRICS } from "@/components/SnapshotView";
import { SymphonyDetail } from "@/components/SymphonyDetail";
import { SymphonyList } from "@/components/SymphonyList";
import { ToastContainer, showToast } from "@/components/Toast";
import { TradePreview } from "@/components/TradePreview";
import { Button } from "@/components/ui/button";
import { useDashboardAccountScope } from "@/features/dashboard/hooks/useDashboardAccountScope";
import { useBenchmarkManager } from "@/features/dashboard/hooks/useBenchmarkManager";
import { useDashboardBootstrap } from "@/features/dashboard/hooks/useDashboardBootstrap";
import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
import { useDashboardLiveOverlay } from "@/features/dashboard/hooks/useDashboardLiveOverlay";
import { usePostCloseSyncAndSnapshot } from "@/features/dashboard/hooks/usePostCloseSyncAndSnapshot";
import type { DashboardPeriod } from "@/features/dashboard/types";
import { summarizeSymphonyDailyChange } from "@/features/dashboard/utils";
import { useFinnhubQuotes } from "@/hooks/useFinnhubQuotes";
import { api, SymphonyInfo } from "@/lib/api";

export default function DashboardPageContainer() {
  const [period, setPeriod] = useState<DashboardPeriod>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [selectedSymphony, setSelectedSymphony] = useState<SymphonyInfo | null>(
    null,
  );
  const [symphonyScrollTo, setSymphonyScrollTo] = useState<
    "trade-preview" | undefined
  >(undefined);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [symphoniesRefreshing, setSymphoniesRefreshing] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("live_enabled");
      return stored === null ? true : stored === "true";
    }
    return true;
  });
  const {
    accounts,
    selectedCredential,
    selectedSubAccount,
    finnhubConfigured,
    isTestMode,
    screenshotConfig,
    setScreenshotConfig,
    setSelectedCredential,
    setSelectedSubAccount,
  } = useDashboardBootstrap();

  const resolvedAccountId = useMemo(() => {
    if (selectedCredential === "__all__") return "all";
    if (selectedSubAccount === "all" && selectedCredential) {
      return `all:${selectedCredential}`;
    }
    return selectedSubAccount || undefined;
  }, [selectedCredential, selectedSubAccount]);

  const {
    summary,
    performance,
    holdings,
    holdingsLastUpdated,
    symphonies,
    loading,
    error,
    setSummary,
    setPerformance,
    setHoldings,
    setHoldingsLastUpdated,
    setSymphonies,
    setLoading,
    setError,
    baseSummaryRef,
    basePerformanceRef,
    fetchData,
    resetForAccountChange,
    restoreBaseData,
  } = useDashboardData({
    resolvedAccountId,
    period,
    customStart,
    customEnd,
  });

  const {
    snapshotRef,
    snapshotVisible,
    snapshotData,
    triggerSnapshot,
    runSyncAndRefresh,
  } = usePostCloseSyncAndSnapshot({
    resolvedAccountId,
    screenshotConfig,
    setScreenshotConfig,
    refreshDashboardData: fetchData,
  });

  const { applyLiveOverlay } = useDashboardLiveOverlay({
    liveEnabled,
    resolvedAccountId,
    period,
    customStart,
    customEnd,
    baseSummaryRef,
    basePerformanceRef,
    setSummary,
    setPerformance,
    setHoldings,
    setHoldingsLastUpdated,
  });

  const { benchmarks, handleBenchmarkAdd, handleBenchmarkRemove } =
    useBenchmarkManager(resolvedAccountId);

  const { showAccountColumn, handleCredentialChange, handleSubAccountChange } =
    useDashboardAccountScope({
      accounts,
      selectedCredential,
      selectedSubAccount,
      setSelectedCredential,
      setSelectedSubAccount,
      resetForAccountChange,
      setLoading,
    });

  const holdingSymbols = (holdings?.holdings ?? [])
    .filter((holding) => holding.market_value > 0.01)
    .map((holding) => holding.symbol);
  const { quotes: finnhubQuotes } = useFinnhubQuotes(
    holdingSymbols,
    finnhubConfigured,
  );

  const { todayDollarChange, todayPctChange, totalValue: symphonyTotalValue } =
    useMemo(() => summarizeSymphonyDailyChange(symphonies), [symphonies]);

  const toggleLive = useCallback(
    (enabled: boolean) => {
      setLiveEnabled(enabled);
      localStorage.setItem("live_enabled", String(enabled));
      if (!enabled) {
        restoreBaseData();
      }
    },
    [restoreBaseData],
  );

  const handleSync = useCallback(async () => {
    if (isTestMode) {
      showToast("Sync is disabled in test mode. Seed test data instead.", "error");
      return;
    }

    setSyncing(true);
    try {
      await runSyncAndRefresh();
    } catch {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [isTestMode, runSyncAndRefresh, setError]);

  if (loading && !summary) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !summary) {
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
        {!isTestMode && (
          <Button onClick={handleSync} disabled={syncing}>
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

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PortfolioHeader
          summary={summary!}
          onSync={handleSync}
          syncing={syncing}
          canSync={!isTestMode}
          onSettings={() => setShowSettings(true)}
          onSnapshot={() => triggerSnapshot(false)}
          onHelp={() => setShowHelp(true)}
          todayDollarChange={todayDollarChange}
          todayPctChange={todayPctChange}
          liveToggle={
            <button
              data-testid="toggle-live"
              onClick={() => toggleLive(!liveEnabled)}
              className="cursor-pointer flex items-center gap-2 rounded-full border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              title={
                liveEnabled
                  ? "Live updates enabled - click to disable"
                  : "Live updates disabled - click to enable"
              }
            >
              <span
                className={`inline-block h-2 w-2 rounded-full transition-colors ${
                  liveEnabled
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                    : "bg-muted-foreground/40"
                }`}
              />
              <span className={liveEnabled ? "text-foreground" : "text-muted-foreground"}>
                Live
              </span>
            </button>
          }
          accountSwitcher={
            accounts.length > 0 ? (
              <AccountSwitcher
                accounts={accounts}
                selectedCredential={selectedCredential}
                selectedSubAccount={selectedSubAccount}
                onCredentialChange={handleCredentialChange}
                onSubAccountChange={handleSubAccountChange}
              />
            ) : undefined
          }
        />

        <PerformanceChart
          data={performance}
          period={period}
          onPeriodChange={(nextPeriod: string) =>
            setPeriod(nextPeriod as DashboardPeriod)
          }
          startDate={customStart}
          endDate={customEnd}
          onStartDateChange={setCustomStart}
          onEndDateChange={setCustomEnd}
          benchmarks={benchmarks}
          onBenchmarkAdd={handleBenchmarkAdd}
          onBenchmarkRemove={handleBenchmarkRemove}
        />

        <MetricCards summary={summary!} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <HoldingsPie holdings={holdings} />
          </div>
          <div className="lg:col-span-3">
            <HoldingsList
              holdings={holdings}
              quotes={finnhubQuotes}
              lastUpdated={holdingsLastUpdated}
            />
          </div>
        </div>

        <SymphonyList
          symphonies={symphonies}
          showAccountColumn={showAccountColumn}
          onSelect={(symphony) => {
            setSelectedSymphony(symphony);
            setSymphonyScrollTo(undefined);
          }}
          onRefresh={async () => {
            setSymphoniesRefreshing(true);
            try {
              const nextSymphonies = await api.getSymphonies(resolvedAccountId);
              setSymphonies(nextSymphonies);
              await applyLiveOverlay(nextSymphonies);
            } catch {
              // Keep existing data if refresh fails.
            } finally {
              setSymphoniesRefreshing(false);
            }
          }}
          refreshLoading={symphoniesRefreshing}
          autoRefreshEnabled={liveEnabled}
        />

        <TradePreview
          accountId={resolvedAccountId}
          portfolioValue={symphonyTotalValue ?? summary?.portfolio_value}
          autoRefreshEnabled={liveEnabled}
          finnhubConfigured={finnhubConfigured}
          onSymphonyClick={(symphonyId) => {
            const match = symphonies.find((symphony) => symphony.id === symphonyId);
            if (match) {
              setSelectedSymphony(match);
              setSymphonyScrollTo("trade-preview");
            }
          }}
        />

        <DetailTabs accountId={resolvedAccountId} onDataChange={fetchData} />
      </div>

      {selectedSymphony && (
        <SymphonyDetail
          symphony={selectedSymphony}
          onClose={() => {
            setSelectedSymphony(null);
            setSymphonyScrollTo(undefined);
          }}
          scrollToSection={symphonyScrollTo}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {snapshotVisible && snapshotData && screenshotConfig && (
        <div style={{ position: "fixed", left: "-9999px", top: 0, zIndex: -1 }}>
          <SnapshotView
            ref={snapshotRef}
            data={snapshotData.perf}
            summary={snapshotData.sum}
            chartMode={
              (screenshotConfig.chart_mode || "twr") as
                | "portfolio"
                | "twr"
                | "mwr"
                | "drawdown"
            }
            selectedMetrics={
              screenshotConfig.metrics?.length
                ? screenshotConfig.metrics
                : DEFAULT_METRICS
            }
            hidePortfolioValue={screenshotConfig.hide_portfolio_value ?? false}
            todayDollarChange={todayDollarChange}
            todayPctChange={todayPctChange}
            periodReturns={snapshotData.periodReturns}
            benchmarks={snapshotData.benchmarks}
          />
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
