"use client";

import { useEffect, useMemo, useState } from "react";

import { AccountSwitcher } from "@/components/AccountSwitcher";
import { HelpModal } from "@/components/HelpModal";
import { HoldingsList } from "@/components/HoldingsList";
import { HoldingsPie } from "@/components/HoldingsPie";
import { MetricCards } from "@/components/MetricCards";
import { PortfolioHeader } from "@/components/PortfolioHeader";
import { SymphonyDetail } from "@/components/SymphonyDetail";
import { SymphonyList } from "@/components/SymphonyList";
import { ToastContainer } from "@/components/Toast";
import { DetailTabs } from "@/features/dashboard/components/DetailTabsContainer";
import { DashboardErrorScreen } from "@/features/dashboard/components/DashboardErrorScreen";
import { DashboardLiveToggleButton } from "@/features/dashboard/components/DashboardLiveToggleButton";
import { DashboardLoadingScreen } from "@/features/dashboard/components/DashboardLoadingScreen";
import { DashboardSnapshotRenderer } from "@/features/dashboard/components/DashboardSnapshotRenderer";
import { DashboardSetupScreen } from "@/features/dashboard/components/DashboardSetupScreen";
import { IraDepositWarningBox } from "@/features/dashboard/components/IraDepositWarningBox";
import { useDashboardAccountScope } from "@/features/dashboard/hooks/useDashboardAccountScope";
import { useBenchmarkManager } from "@/features/dashboard/hooks/useBenchmarkManager";
import { useDashboardBootstrap } from "@/features/dashboard/hooks/useDashboardBootstrap";
import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
import { useDashboardLiveToggle } from "@/features/dashboard/hooks/useDashboardLiveToggle";
import { useDashboardLiveOverlay } from "@/features/dashboard/hooks/useDashboardLiveOverlay";
import { usePostCloseSyncAndSnapshot } from "@/features/dashboard/hooks/usePostCloseSyncAndSnapshot";
import { useDashboardSymphonyRefresh } from "@/features/dashboard/hooks/useDashboardSymphonyRefresh";
import { useDashboardSymphonySelection } from "@/features/dashboard/hooks/useDashboardSymphonySelection";
import { useDashboardSyncAction } from "@/features/dashboard/hooks/useDashboardSyncAction";
import { useSymphonyExportProgressToast } from "@/features/dashboard/hooks/useSymphonyExportProgressToast";
import { useSyncCompletionRefresh } from "@/features/dashboard/hooks/useSyncCompletionRefresh";
import type { DashboardPeriod } from "@/features/dashboard/types";
import { summarizeSymphonyDailyChange } from "@/features/dashboard/utils";
import { PerformanceChart } from "@/features/charting/components/PerformanceChartContainer";
import { SettingsModal } from "@/features/settings/components/SettingsModalContainer";
import { TradePreview } from "@/features/trade-preview/components/TradePreviewContainer";
import { useFinnhubQuotes } from "@/hooks/useFinnhubQuotes";

export default function DashboardPageContainer() {
  const [period, setPeriod] = useState<DashboardPeriod>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dismissedIraWarningKey, setDismissedIraWarningKey] = useState<string | null>(null);
  const {
    accounts,
    bootstrapLoading,
    bootstrapError,
    composerConfigOk,
    composerConfigError,
    selectedCredential,
    selectedSubAccount,
    finnhubConfigured,
    isTestMode,
    isFirstStartTestMode,
    firstStartRunId,
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

  const iraWarningStorageKey = useMemo(() => {
    if (isFirstStartTestMode && firstStartRunId) {
      return `pd:first-start:warning:ira:${firstStartRunId}`;
    }
    return "pd:warning:ira:v1";
  }, [isFirstStartTestMode, firstStartRunId]);

  useEffect(() => {
    if (bootstrapLoading || isTestMode) return;

    if (isFirstStartTestMode && firstStartRunId) {
      const runMarkerKey = "pd:first-start:run-id";
      const prevRunId = localStorage.getItem(runMarkerKey);
      if (prevRunId !== firstStartRunId) {
        localStorage.removeItem("live_enabled");
        localStorage.removeItem("last_post_close_update");
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("pd:first-start:warning:")) {
            localStorage.removeItem(key);
          }
        }
        localStorage.setItem(runMarkerKey, firstStartRunId);
      }
    }
  }, [
    bootstrapLoading,
    firstStartRunId,
    isFirstStartTestMode,
    isTestMode,
  ]);

  const showIraWarning =
    !bootstrapLoading &&
    !isTestMode &&
    dismissedIraWarningKey !== iraWarningStorageKey &&
    localStorage.getItem(iraWarningStorageKey) !== "1";

  useSymphonyExportProgressToast();
  useSyncCompletionRefresh({ resolvedAccountId });

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
    enableAutoPostClose: !isFirstStartTestMode,
  });

  const { liveEnabled, toggleLive } = useDashboardLiveToggle({
    restoreBaseData,
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

  const { syncing, handleSync } = useDashboardSyncAction({
    isTestMode,
    runSyncAndRefresh,
    setError,
  });

  const {
    selectedSymphony,
    symphonyScrollTo,
    handleSymphonySelect,
    handleSymphonyClose,
    handleTradePreviewSymphonyClick,
  } = useDashboardSymphonySelection();

  const { symphoniesRefreshing, refreshSymphonies } = useDashboardSymphonyRefresh({
    resolvedAccountId,
    setSymphonies,
    applyLiveOverlay,
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

  if (bootstrapLoading) {
    return <DashboardLoadingScreen />;
  }

  if (bootstrapError) {
    return (
      <DashboardErrorScreen
        error={bootstrapError}
        isTestMode={isTestMode}
        syncing={syncing}
        onSync={handleSync}
      />
    );
  }

  if (accounts.length === 0) {
    if (isTestMode || !composerConfigOk) {
      return (
        <DashboardSetupScreen
          isTestMode={isTestMode}
          composerConfigError={composerConfigError}
        />
      );
    }

    return (
      <DashboardErrorScreen
        error={
          "No accounts were discovered. Your Composer credentials look valid, but the backend could not discover accounts on startup (Composer API call may have failed). Check the backend logs and retry."
        }
        isTestMode={isTestMode}
        syncing={syncing}
        onSync={handleSync}
      />
    );
  }

  if (loading && !summary) {
    return <DashboardLoadingScreen />;
  }

  if (error && !summary) {
    return (
      <DashboardErrorScreen
        error={error}
        isTestMode={isTestMode}
        syncing={syncing}
        onSync={handleSync}
      />
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
            <DashboardLiveToggleButton
              liveEnabled={liveEnabled}
              onToggle={toggleLive}
            />
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
          onSelect={handleSymphonySelect}
          onRefresh={refreshSymphonies}
          refreshLoading={symphoniesRefreshing}
          autoRefreshEnabled={liveEnabled}
        />

        <TradePreview
          accountId={resolvedAccountId}
          portfolioValue={symphonyTotalValue ?? summary?.portfolio_value}
          autoRefreshEnabled={liveEnabled}
          finnhubConfigured={finnhubConfigured}
          onSymphonyClick={(symphonyId) =>
            handleTradePreviewSymphonyClick(symphonyId, symphonies)
          }
        />

        <DetailTabs accountId={resolvedAccountId} onDataChange={fetchData} />
      </div>

      {selectedSymphony && (
        <SymphonyDetail
          symphony={selectedSymphony}
          onClose={handleSymphonyClose}
          scrollToSection={symphonyScrollTo}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <DashboardSnapshotRenderer
        snapshotRef={snapshotRef}
        snapshotVisible={snapshotVisible}
        snapshotData={snapshotData}
        screenshotConfig={screenshotConfig}
        todayDollarChange={todayDollarChange}
        todayPctChange={todayPctChange}
      />

      {showIraWarning && (
        <IraDepositWarningBox
          onClose={() => {
            localStorage.setItem(iraWarningStorageKey, "1");
            setDismissedIraWarningKey(iraWarningStorageKey);
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
}
