"use client";

import { useEffect, useState, useCallback } from "react";
import { api, Summary, PerformancePoint, HoldingsResponse } from "@/lib/api";
import { PortfolioHeader } from "./PortfolioHeader";
import { PerformanceChart } from "./PerformanceChart";
import { MetricCards } from "./MetricCards";
import { HoldingsPie } from "./HoldingsPie";
import { HoldingsList } from "./HoldingsList";
import { DetailTabs } from "./DetailTabs";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Period = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [performance, setPerformance] = useState<PerformancePoint[]>([]);
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [s, h] = await Promise.all([
        api.getSummary(),
        api.getHoldings(),
      ]);
      setSummary(s);
      setHoldings(h);
      try {
        const p = await api.getPerformance(
          customStart || customEnd ? undefined : period,
          customStart || undefined,
          customEnd || undefined,
        );
        setPerformance(p);
      } catch {
        setPerformance([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.triggerSync();
      await fetchData();
    } catch (e) {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error}</p>
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
        {/* Header: PV, daily change, period selector, sync button */}
        <PortfolioHeader
          summary={summary!}
          onSync={handleSync}
          syncing={syncing}
        />

        {/* Performance chart */}
        <PerformanceChart
          data={performance}
          period={period}
          onPeriodChange={setPeriod}
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

        {/* Detail tabs: Transactions, Cash Flows, All Metrics */}
        <DetailTabs />
      </div>
    </div>
  );
}
