"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Summary, PerformancePoint, HoldingsResponse, AccountInfo, SymphonyInfo } from "@/lib/api";
import { PortfolioHeader } from "./PortfolioHeader";
import { PerformanceChart } from "./PerformanceChart";
import { MetricCards } from "./MetricCards";
import { HoldingsPie } from "./HoldingsPie";
import { HoldingsList } from "./HoldingsList";
import { DetailTabs } from "./DetailTabs";
import { SymphonyList } from "./SymphonyList";
import { SymphonyDetail } from "./SymphonyDetail";
import { AccountSwitcher } from "./AccountSwitcher";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Period = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedCredential, setSelectedCredential] = useState("");
  const [selectedSubAccount, setSelectedSubAccount] = useState(""); // UUID or "all"
  const [summary, setSummary] = useState<Summary | null>(null);
  const [performance, setPerformance] = useState<PerformancePoint[]>([]);
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symphonies, setSymphonies] = useState<SymphonyInfo[]>([]);
  const [selectedSymphony, setSelectedSymphony] = useState<SymphonyInfo | null>(null);

  // Resolve the account_id query param based on selection
  const resolvedAccountId = selectedCredential === "__all__"
    ? "all"
    : selectedSubAccount === "all" && selectedCredential
      ? `all:${selectedCredential}`
      : selectedSubAccount || undefined;

  // Load accounts on mount
  useEffect(() => {
    api.getAccounts().then((accts) => {
      setAccounts(accts);
      if (accts.length > 0) {
        const firstCred = accts[0].credential_name;
        setSelectedCredential(firstCred);
        const subsForCred = accts.filter((a) => a.credential_name === firstCred);
        setSelectedSubAccount(subsForCred.length > 1 ? "all" : subsForCred[0]?.id || "");
      }
    }).catch(() => {
      // Accounts not yet discovered — will show sync prompt
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!resolvedAccountId) return;
    try {
      setError(null);
      const [s, h] = await Promise.all([
        api.getSummary(
          resolvedAccountId,
          customStart || customEnd ? undefined : period,
          customStart || undefined,
          customEnd || undefined,
        ),
        api.getHoldings(resolvedAccountId),
      ]);
      setSummary(s);
      setHoldings(h);
      try {
        const p = await api.getPerformance(
          resolvedAccountId,
          customStart || customEnd ? undefined : period,
          customStart || undefined,
          customEnd || undefined,
        );
        setPerformance(p);
      } catch {
        setPerformance([]);
      }
      try {
        const syms = await api.getSymphonies(resolvedAccountId);
        setSymphonies(syms);
      } catch {
        setSymphonies([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [resolvedAccountId, period, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCredentialChange = (credName: string) => {
    setSelectedCredential(credName);
    if (credName === "__all__") {
      setSelectedSubAccount("all");
    } else {
      const subsForCred = accounts.filter((a) => a.credential_name === credName);
      setSelectedSubAccount(subsForCred.length > 1 ? "all" : subsForCred[0]?.id || "");
    }
    setSummary(null);
    setPerformance([]);
    setHoldings(null);
    setSymphonies([]);
    setError(null);
    setLoading(true);
  };

  const handleSubAccountChange = (accountId: string) => {
    setSelectedSubAccount(accountId);
    setLoading(true);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.triggerSync(resolvedAccountId);
      await fetchData();
    } catch (e) {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

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
              ? "Click the button below to fetch your portfolio history from Composer. This may take up to a minute on the first run."
              : error}
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? "Syncing..." : "Initial Sync"}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header: PV, daily change, account switcher, sync button */}
        <PortfolioHeader
          summary={summary!}
          onSync={handleSync}
          syncing={syncing}
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

        {/* Performance chart */}
        <PerformanceChart
          data={performance}
          period={period}
          onPeriodChange={(p: string) => setPeriod(p as Period)}
          startDate={customStart}
          endDate={customEnd}
          onStartDateChange={setCustomStart}
          onEndDateChange={setCustomEnd}
        />

        {/* Metric cards row */}
        <MetricCards summary={summary!} />

        {/* Holdings section: pie + list */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <HoldingsPie holdings={holdings} />
          </div>
          <div className="lg:col-span-3">
            <HoldingsList holdings={holdings} />
          </div>
        </div>

        {/* Active Symphonies */}
        <SymphonyList
          symphonies={symphonies}
          showAccountColumn={selectedCredential === "__all__" || selectedSubAccount === "all"}
          onSelect={setSelectedSymphony}
        />

        {/* Detail tabs: Transactions, Cash Flows, All Metrics */}
        <DetailTabs accountId={resolvedAccountId} onDataChange={fetchData} />
      </div>

      {/* Symphony detail overlay */}
      {selectedSymphony && (
        <SymphonyDetail
          symphony={selectedSymphony}
          onClose={() => setSelectedSymphony(null)}
        />
      )}
    </div>
  );
}
