"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, Summary, PerformancePoint, HoldingsResponse, AccountInfo, SymphonyInfo, ScreenshotConfig, BenchmarkEntry } from "@/lib/api";
import { useFinnhubQuotes } from "@/hooks/useFinnhubQuotes";
import { isMarketOpen, isAfterClose, todayET } from "@/lib/marketHours";
import { PortfolioHeader } from "./PortfolioHeader";
import { PerformanceChart } from "./PerformanceChart";
import { MetricCards } from "./MetricCards";
import { HoldingsPie } from "./HoldingsPie";
import { HoldingsList } from "./HoldingsList";
import { DetailTabs } from "./DetailTabs";
import { SymphonyList } from "./SymphonyList";
import { SymphonyDetail } from "./SymphonyDetail";
import { TradePreview } from "./TradePreview";
import { HelpModal } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { AccountSwitcher } from "./AccountSwitcher";
import { SnapshotView, DEFAULT_METRICS } from "./SnapshotView";
import { ToastContainer, showToast } from "./Toast";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPng } from "html-to-image";

type Period = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedCredential, setSelectedCredential] = useState("");
  const [selectedSubAccount, setSelectedSubAccount] = useState(""); // UUID or "all"
  const [summary, setSummary] = useState<Summary | null>(null);
  const [performance, setPerformance] = useState<PerformancePoint[]>([]);
  const [holdings, setHoldings] = useState<HoldingsResponse | null>(null);
  const [holdingsLastUpdated, setHoldingsLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symphonies, setSymphonies] = useState<SymphonyInfo[]>([]);
  const [selectedSymphony, setSelectedSymphony] = useState<SymphonyInfo | null>(null);
  const [symphonyScrollTo, setSymphonyScrollTo] = useState<"trade-preview" | undefined>(undefined);
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
  const [finnhubConfigured, setFinnhubConfigured] = useState(false);
  const baseHoldingsRef = useRef<HoldingsResponse | null>(null);
  const basePerformanceRef = useRef<PerformancePoint[]>([]);
  const baseSummaryRef = useRef<Summary | null>(null);
  const [screenshotConfig, setScreenshotConfig] = useState<ScreenshotConfig | null>(null);
  const [snapshotVisible, setSnapshotVisible] = useState(false);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [snapshotData, setSnapshotData] = useState<{ perf: PerformancePoint[]; sum: Summary; periodReturns?: { "1W"?: number; "1M"?: number; "YTD"?: number }; benchmarks?: import("./SnapshotView").SnapshotBenchmark[] } | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);

  // Finnhub real-time quotes for holdings
  const holdingSymbols = (holdings?.holdings ?? []).filter((h) => h.market_value > 0.01).map((h) => h.symbol);
  const { quotes: finnhubQuotes } = useFinnhubQuotes(holdingSymbols, finnhubConfigured);

  // Resolve the account_id query param based on selection
  const resolvedAccountId = selectedCredential === "__all__"
    ? "all"
    : selectedSubAccount === "all" && selectedCredential
      ? `all:${selectedCredential}`
      : selectedSubAccount || undefined;

  const BENCH_COLORS = ["#f97316", "#e4e4e7", "#ec4899"];
  const clampLabel = (s: string) => s.length > 21 ? s.slice(0, 19) + "\u2026" : s;
  const pickColor = (current: BenchmarkEntry[]) => BENCH_COLORS.find((c) => !current.some((b) => b.color === c)) || BENCH_COLORS[0];

  const handleBenchmarkAdd = useCallback((ticker: string) => {
    if (benchmarks.length >= 3 || benchmarks.some((b) => b.ticker === ticker)) return;
    const color = pickColor(benchmarks);
    const placeholder: BenchmarkEntry = { ticker, label: ticker, data: [], color };
    setBenchmarks((prev) => [...prev, placeholder]);
    if (ticker.startsWith("symphony:")) {
      const symId = ticker.slice(9);
      api.getSymphonyBenchmark(symId)
        .then((res) => {
          const label = clampLabel(res.name || symId);
          setBenchmarks((prev) => prev.map((b) => b.ticker === ticker ? { ...b, label, data: res.data } : b));
        })
        .catch(() => setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker)));
    } else {
      api.getBenchmarkHistory(ticker, undefined, undefined, resolvedAccountId)
        .then((res) => setBenchmarks((prev) => prev.map((b) => b.ticker === ticker ? { ...b, data: res.data } : b)))
        .catch(() => setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker)));
    }
  }, [benchmarks, resolvedAccountId]);

  const handleBenchmarkRemove = useCallback((ticker: string) => {
    setBenchmarks((prev) => prev.filter((b) => b.ticker !== ticker));
  }, []);

  // Load accounts + config on mount
  useEffect(() => {
    api.getConfig().then((cfg) => {
      setFinnhubConfigured(cfg.finnhub_configured ?? !!cfg.finnhub_api_key);
      if (cfg.screenshot) setScreenshotConfig(cfg.screenshot);
    }).catch(() => {});
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
      baseSummaryRef.current = s;
      setHoldings(h);
      setHoldingsLastUpdated(new Date());
      baseHoldingsRef.current = h;
      try {
        const p = await api.getPerformance(
          resolvedAccountId,
          customStart || customEnd ? undefined : period,
          customStart || undefined,
          customEnd || undefined,
        );
        setPerformance(p);
        basePerformanceRef.current = p;
      } catch {
        setPerformance([]);
        basePerformanceRef.current = [];
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

  // Snapshot capture logic (must be defined before the post-close useEffect that references it)
  const triggerSnapshot = useCallback(async (autoMode = false) => {
    let cfg = screenshotConfig;
    try {
      const appCfg = await api.getConfig();
      if (appCfg.screenshot) {
        cfg = appCfg.screenshot;
        setScreenshotConfig(cfg);
      }
    } catch { /* use cached */ }

    if (!cfg) {
      if (!autoMode) showToast("Configure screenshot settings first", "error");
      return;
    }
    if (autoMode && !cfg.enabled) return;
    if (!cfg.local_path) {
      if (!autoMode) showToast("Set a screenshot save folder in Settings", "error");
      return;
    }

    const ssAccountId = cfg.account_id || resolvedAccountId;
    const ssPeriod = cfg.period === "custom" ? undefined : cfg.period;
    const ssStart = cfg.period === "custom" ? cfg.custom_start : undefined;

    try {
      // Fetch main summary + perf, plus period returns for 1W/1M/YTD if any are selected
      const needsPeriodReturns = cfg.metrics?.some((m: string) => ["return_1w", "return_1m", "return_ytd"].includes(m));
      const [ssSum, ssPerf, ...periodSums] = await Promise.all([
        api.getSummary(ssAccountId, ssPeriod, ssStart, undefined),
        api.getPerformance(ssAccountId, ssPeriod, ssStart, undefined),
        ...(needsPeriodReturns ? [
          api.getSummary(ssAccountId, "1W").catch(() => null),
          api.getSummary(ssAccountId, "1M").catch(() => null),
          api.getSummary(ssAccountId, "YTD").catch(() => null),
        ] : []),
      ]);
      const ssPeriodReturns: { "1W"?: number; "1M"?: number; "YTD"?: number } = {};
      if (needsPeriodReturns) {
        if (periodSums[0]) ssPeriodReturns["1W"] = (periodSums[0] as Summary).time_weighted_return;
        if (periodSums[1]) ssPeriodReturns["1M"] = (periodSums[1] as Summary).time_weighted_return;
        if (periodSums[2]) ssPeriodReturns["YTD"] = (periodSums[2] as Summary).time_weighted_return;
      }

      // Fetch benchmark data for snapshot if configured
      const SNAP_BENCH_COLORS = ["#f97316", "#e4e4e7", "#ec4899"];
      const ssBenchTickers: string[] = (cfg.benchmarks || []).slice(0, 3);
      const ssBenchmarks: import("./SnapshotView").SnapshotBenchmark[] = [];
      if (ssBenchTickers.length > 0 && cfg.chart_mode !== "portfolio") {
        const benchResults = await Promise.all(
          ssBenchTickers.map((t) => api.getBenchmarkHistory(t, undefined, undefined, ssAccountId).catch(() => null))
        );
        benchResults.forEach((res, i) => {
          if (res && res.data.length > 0) {
            ssBenchmarks.push({ ticker: ssBenchTickers[i], data: res.data, color: SNAP_BENCH_COLORS[i % SNAP_BENCH_COLORS.length] });
          }
        });
      }

      setSnapshotData({ perf: ssPerf, sum: ssSum, periodReturns: ssPeriodReturns, benchmarks: ssBenchmarks });
      setSnapshotVisible(true);

      // Wait for SnapshotView to render (poll for ref up to 3s)
      let attempts = 0;
      while (!snapshotRef.current && attempts < 30) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      if (!snapshotRef.current) {
        throw new Error("SnapshotView did not mount in time");
      }

      // Extra settle time for Recharts to finish painting
      await new Promise((r) => setTimeout(r, 300));

      const dataUrl = await toPng(snapshotRef.current, {
        width: 1200,
        height: 900,
        pixelRatio: 2,
        backgroundColor: "#09090b",
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const dateStr = todayET();
      await api.uploadScreenshot(blob, dateStr);
      showToast("Screenshot saved");
    } catch (e) {
      console.error("Screenshot capture failed:", e);
      if (!autoMode) showToast("Screenshot failed", "error");
      if (autoMode) throw e;
    } finally {
      setSnapshotVisible(false);
      setSnapshotData(null);
    }
  }, [screenshotConfig, resolvedAccountId]);

  // Once-per-day post-close update: ensure a full data refresh happens
  // after market close each trading day, regardless of the Live toggle.
  // Runs immediately on mount AND on a 60s interval so there's no delay
  // when the user opens the app after close.
  useEffect(() => {
    if (!resolvedAccountId) return;
    const doPostCloseUpdate = async () => {
      if (!isAfterClose()) return;
      const today = todayET();
      const lastCloseUpdate = localStorage.getItem("last_post_close_update");
      if (lastCloseUpdate === today) return;
      try {
        await api.triggerSync(resolvedAccountId);
        await fetchData();
        // Auto-capture screenshot after post-close sync
        await triggerSnapshot(true);
        // Only mark complete after everything succeeds (including snapshot)
        localStorage.setItem("last_post_close_update", today);
      } catch (e) {
        // Don't set the flag — allows retry on next 60s interval
        console.error("Post-close update failed, will retry:", e);
      }
    };
    doPostCloseUpdate(); // immediate check on mount
    const id = setInterval(doPostCloseUpdate, 60_000);
    return () => clearInterval(id);
  }, [resolvedAccountId, fetchData, triggerSnapshot]);

  const toggleLive = useCallback((enabled: boolean) => {
    setLiveEnabled(enabled);
    localStorage.setItem("live_enabled", String(enabled));
    if (!enabled) {
      // Restore base data when disabling live
      if (baseSummaryRef.current) setSummary(baseSummaryRef.current);
      if (baseHoldingsRef.current) setHoldings(baseHoldingsRef.current);
      if (basePerformanceRef.current.length) setPerformance(basePerformanceRef.current);
    }
  }, []);

  const applyLiveOverlay = useCallback(async (freshSymphonies: SymphonyInfo[]) => {
    if (!liveEnabled || !isMarketOpen() || !resolvedAccountId || !freshSymphonies.length) return;

    const livePV = freshSymphonies.reduce((s, x) => s + x.value, 0);
    // Use stored net_deposits — symphony sum doesn't match portfolio-level ND
    // (cash outside symphonies, rounding, etc. would create phantom deposits)
    const base = basePerformanceRef.current;
    const storedND = base.length > 0 ? base[base.length - 1].net_deposits : (baseSummaryRef.current?.net_deposits ?? 0);

    // 1. Live summary → updates MetricCards + PortfolioHeader
    try {
      const liveSummary = await api.getLiveSummary(
        resolvedAccountId, livePV, storedND,
        customStart || customEnd ? undefined : period,
        customStart || undefined,
        customEnd || undefined,
      );
      setSummary(liveSummary);
    } catch { /* fall back to base summary */ }

    // 2. Live chart point → append/update today in performance
    if (base.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const lastPt = base[base.length - 1];
      const prevPV = lastPt.portfolio_value;
      const dailyRet = prevPV > 0 ? ((livePV - prevPV) / prevPV) * 100 : 0;
      const cumRet = storedND > 0 ? ((livePV - storedND) / storedND) * 100 : 0;
      // Approximate TWR: compound previous TWR with today's return
      const prevTWR = lastPt.time_weighted_return || 0;
      const liveTWR = ((1 + prevTWR / 100) * (1 + dailyRet / 100) - 1) * 100;
      // Approximate drawdown from TWR peak
      const twrPeak = Math.max(...base.map((p) => 1 + (p.time_weighted_return || 0) / 100), 1 + liveTWR / 100);
      const liveDD = twrPeak > 0 ? ((1 + liveTWR / 100) / twrPeak - 1) * 100 : 0;

      const todayPt: PerformancePoint = {
        date: today,
        portfolio_value: livePV,
        net_deposits: storedND,
        cumulative_return_pct: cumRet,
        daily_return_pct: dailyRet,
        time_weighted_return: liveTWR,
        money_weighted_return: lastPt.money_weighted_return || 0,
        current_drawdown: Math.min(liveDD, 0),
      };

      if (lastPt.date === today) {
        setPerformance([...base.slice(0, -1), todayPt]);
      } else {
        setPerformance([...base, todayPt]);
      }
    }

    // 3. Live holdings from symphony data (only if non-empty)
    const holdingMap = new Map<string, { value: number; pctChange: number }>(); 
    for (const sym of freshSymphonies) {
      for (const h of sym.holdings) {
        const existing = holdingMap.get(h.ticker);
        if (existing) {
          existing.value += h.value;
        } else {
          holdingMap.set(h.ticker, { value: h.value, pctChange: h.last_percent_change });
        }
      }
    }
    if (holdingMap.size > 0) {
      const totalValue = Array.from(holdingMap.values()).reduce((s, h) => s + h.value, 0);
      const liveHoldings: HoldingsResponse = {
        date: new Date().toISOString().slice(0, 10),
        holdings: Array.from(holdingMap.entries())
          .map(([symbol, h]) => ({
            symbol,
            quantity: 0, // not available from symphony holdings
            market_value: h.value,
            allocation_pct: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
          }))
          .sort((a, b) => b.market_value - a.market_value),
      };
      setHoldings(liveHoldings);
      setHoldingsLastUpdated(new Date());
    }
  }, [liveEnabled, resolvedAccountId, period, customStart, customEnd]);

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
        {/* Header: PV, total/today change, live toggle, account switcher, sync */}
        <PortfolioHeader
          summary={summary!}
          onSync={handleSync}
          syncing={syncing}
          onSettings={() => setShowSettings(true)}
          onSnapshot={() => triggerSnapshot(false)}
          onHelp={() => setShowHelp(true)}
          todayDollarChange={symphonies.length ? symphonies.reduce((sum, s) => sum + s.last_dollar_change, 0) : undefined}
          todayPctChange={symphonies.length ? (() => { const totalValue = symphonies.reduce((s, x) => s + x.value, 0); const totalDayDollar = symphonies.reduce((s, x) => s + x.last_dollar_change, 0); return totalValue > 0 ? (totalDayDollar / (totalValue - totalDayDollar)) * 100 : 0; })() : undefined}
          liveToggle={
            <button
              onClick={() => toggleLive(!liveEnabled)}
              className="cursor-pointer flex items-center gap-2 rounded-full border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              title={liveEnabled ? "Live updates enabled — click to disable" : "Live updates disabled — click to enable"}
            >
              <span className={`inline-block h-2 w-2 rounded-full transition-colors ${liveEnabled ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-muted-foreground/40"}`} />
              <span className={liveEnabled ? "text-foreground" : "text-muted-foreground"}>Live</span>
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

        {/* Performance chart */}
        <PerformanceChart
          data={performance}
          period={period}
          onPeriodChange={(p: string) => setPeriod(p as Period)}
          startDate={customStart}
          endDate={customEnd}
          onStartDateChange={setCustomStart}
          onEndDateChange={setCustomEnd}
          benchmarks={benchmarks}
          onBenchmarkAdd={handleBenchmarkAdd}
          onBenchmarkRemove={handleBenchmarkRemove}
        />

        {/* Metric cards row */}
        <MetricCards summary={summary!} />

        {/* Holdings section: pie + list */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <HoldingsPie holdings={holdings} />
          </div>
          <div className="lg:col-span-3">
            <HoldingsList holdings={holdings} quotes={finnhubQuotes} lastUpdated={holdingsLastUpdated} />
          </div>
        </div>

        {/* Active Symphonies */}
        <SymphonyList
          symphonies={symphonies}
          showAccountColumn={selectedCredential === "__all__" || selectedSubAccount === "all"}
          onSelect={(sym) => { setSelectedSymphony(sym); setSymphonyScrollTo(undefined); }}
          onRefresh={async () => {
            setSymphoniesRefreshing(true);
            try {
              const syms = await api.getSymphonies(resolvedAccountId);
              setSymphonies(syms);
              applyLiveOverlay(syms);
            } catch { /* ignore */ }
            finally { setSymphoniesRefreshing(false); }
          }}
          refreshLoading={symphoniesRefreshing}
          autoRefreshEnabled={liveEnabled}
        />

        {/* Next Automated Trade Preview */}
        <TradePreview
          accountId={resolvedAccountId}
          portfolioValue={symphonies.length ? symphonies.reduce((s, x) => s + x.value, 0) : summary?.portfolio_value}
          autoRefreshEnabled={liveEnabled}
          finnhubConfigured={finnhubConfigured}
          onSymphonyClick={(symphonyId) => {
            const match = symphonies.find((s) => s.id === symphonyId);
            if (match) {
              setSelectedSymphony(match);
              setSymphonyScrollTo("trade-preview");
            }
          }}
        />

        {/* Detail tabs: Transactions, Non-Trade Activity */}
        <DetailTabs accountId={resolvedAccountId} onDataChange={fetchData} />

      </div>

      {/* Symphony detail overlay */}
      {selectedSymphony && (
        <SymphonyDetail
          symphony={selectedSymphony}
          onClose={() => { setSelectedSymphony(null); setSymphonyScrollTo(undefined); }}
          scrollToSection={symphonyScrollTo}
        />
      )}

      {/* Help modal */}
      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* Off-screen snapshot view for html-to-image capture */}
      {snapshotVisible && snapshotData && screenshotConfig && (
        <div style={{ position: "fixed", left: "-9999px", top: 0, zIndex: -1 }}>
          <SnapshotView
            ref={snapshotRef}
            data={snapshotData.perf}
            summary={snapshotData.sum}
            chartMode={(screenshotConfig.chart_mode || "twr") as "portfolio" | "twr" | "mwr" | "drawdown"}
            selectedMetrics={screenshotConfig.metrics?.length ? screenshotConfig.metrics : DEFAULT_METRICS}
            hidePortfolioValue={screenshotConfig.hide_portfolio_value ?? false}
            todayDollarChange={symphonies.length ? symphonies.reduce((s, x) => s + x.last_dollar_change, 0) : undefined}
            todayPctChange={symphonies.length ? (() => { const totalValue = symphonies.reduce((s, x) => s + x.value, 0); const totalDayDollar = symphonies.reduce((s, x) => s + x.last_dollar_change, 0); return totalValue > 0 ? (totalDayDollar / (totalValue - totalDayDollar)) * 100 : 0; })() : undefined}
            periodReturns={snapshotData.periodReturns}
            benchmarks={snapshotData.benchmarks}
          />
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
