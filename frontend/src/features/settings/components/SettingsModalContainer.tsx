"use client";

import { useEffect } from "react";
import { X, FolderOpen, Check, Loader2, Camera } from "lucide-react";
import { useSettingsModalState } from "@/features/settings/hooks/useSettingsModalState";
import { CHART_MODES, PERIOD_OPTIONS } from "@/features/settings/options";
import { METRIC_OPTIONS } from "@/features/dashboard/snapshot/metricCards";
import { MAX_BENCHMARKS } from "@/features/charting/benchmarkConfig";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const {
    localPath,
    setLocalPath,
    exportEnabled,
    setExportEnabled,
    saving,
    saved,
    setSaved,
    error,
    setError,
    handleSave,
    ss,
    setSs,
    ssSaving,
    ssSaved,
    setSsSaved,
    ssError,
    handleSaveScreenshot,
    todayDollarAutoDisabled,
    setTodayDollarAutoDisabled,
    toggleMetric,
    accountOptions,
  } = useSettingsModalState();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);


  return (
    <div
      data-testid="modal-settings"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 my-16 w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl">
        <button
          onClick={onClose}
          className="cursor-pointer absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 space-y-8">
          <h2 className="text-xl font-semibold text-foreground">Settings</h2>

          {/* Symphony Export Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Symphony Export
            </h3>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-foreground/80">Enable local symphony export</span>
              <button
                type="button"
                role="switch"
                aria-checked={exportEnabled}
                onClick={() => {
                  setExportEnabled(!exportEnabled);
                  setSaved(false);
                  setError("");
                }}
                className={`cursor-pointer relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  exportEnabled ? "bg-emerald-600" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    exportEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            {/* Local Path */}
            <div className="space-y-2">
              <label className="text-sm text-foreground/80 flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4" />
                Local Export Folder
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => { setLocalPath(e.target.value); setSaved(false); setError(""); }}
                  placeholder="C:\\Users\\you\\Documents\\SymphonyBackups"
                  disabled={!exportEnabled}
                  className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                  {saving ? "Saving..." : saved ? "Saved" : "Save"}
                </button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <p className="text-xs text-muted-foreground/60">
                Symphony structures are exported here during daily sync and when edits are detected.
              </p>
            </div>
          </div>

          {/* Daily Snapshot Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Camera className="h-4 w-4" />
              Daily Snapshot
            </h3>

            {/* Enable toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-foreground/80">Enable daily snapshot</span>
              <button
                type="button"
                role="switch"
                aria-checked={ss.enabled}
                onClick={() => { setSs((p) => ({ ...p, enabled: !p.enabled })); setSsSaved(false); }}
                className={`cursor-pointer relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ss.enabled ? "bg-emerald-600" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    ss.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            {/* Save folder */}
            <div className="space-y-1">
              <label className="text-sm text-foreground/80 flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4" />
                Save Folder
              </label>
              <input
                type="text"
                value={ss.local_path}
                onChange={(e) => { setSs((p) => ({ ...p, local_path: e.target.value })); setSsSaved(false); }}
                placeholder="C:\\Users\\you\\Documents\\PortfolioSnapshots"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Account */}
            {accountOptions.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm text-foreground/80">Account</label>
                <select
                  value={ss.account_id || accountOptions[0]?.value || ""}
                  onChange={(e) => { setSs((p) => ({ ...p, account_id: e.target.value })); setSsSaved(false); }}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {accountOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Chart type */}
            <div className="space-y-1">
              <label className="text-sm text-foreground/80">Chart Type</label>
              <select
                value={ss.chart_mode}
                onChange={(e) => { setSs((p) => ({ ...p, chart_mode: e.target.value })); setSsSaved(false); }}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {CHART_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <label className="text-sm text-foreground/80">Date Range</label>
              <select
                value={ss.period === "custom" || (ss.custom_start && ss.period !== "custom") ? "custom" : ss.period}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setSs((p) => ({ ...p, period: "custom" }));
                  } else {
                    setSs((p) => ({ ...p, period: val, custom_start: "" }));
                  }
                  setSsSaved(false);
                }}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {(ss.period === "custom" || ss.custom_start) && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Start:</label>
                  <input
                    type="date"
                    value={ss.custom_start}
                    onChange={(e) => { setSs((p) => ({ ...p, custom_start: e.target.value, period: "custom" })); setSsSaved(false); }}
                    className="rounded-md border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground/30"
                  />
                  <span className="text-xs text-muted-foreground">to today</span>
                </div>
              )}
            </div>

            {/* Hide portfolio value */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ss.hide_portfolio_value}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSs((p) => ({
                    ...p,
                    hide_portfolio_value: checked,
                    ...(checked ? { metrics: p.metrics.filter((m) => m !== "today_dollar") } : {}),
                  }));
                  if (checked) setTodayDollarAutoDisabled(true);
                  setSsSaved(false);
                }}
                className="rounded border-border accent-emerald-600"
              />
              <span className="text-sm text-foreground/80">Hide portfolio value</span>
            </label>

            {/* Benchmark tickers */}
            <div className="space-y-2 mb-2">
              <label className="text-sm text-foreground/80">
                Benchmark Overlays{" "}
                <span className="text-muted-foreground text-xs">(up to 10 tickers, e.g. SPY)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(ss.benchmarks || []).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground/80"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => { setSs((p) => ({ ...p, benchmarks: (p.benchmarks || []).filter((b) => b !== t) })); setSsSaved(false); }}
                      className="cursor-pointer text-muted-foreground hover:text-foreground ml-0.5"
                    >
                      x
                    </button>
                  </span>
                ))}
                {(ss.benchmarks || []).length < MAX_BENCHMARKS && (
                  <input
                    type="text"
                    placeholder="+ Add ticker"
                    className="w-28 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                        if (val && !(ss.benchmarks || []).includes(val)) {
                          setSs((p) => ({ ...p, benchmarks: [...(p.benchmarks || []), val] }));
                          setSsSaved(false);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground/60">
                Benchmark lines are shown on TWR, MWR, and Drawdown chart modes (not Portfolio Value).
              </p>
            </div>

            {/* Metrics to show */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-foreground/80">Metrics to Show <span className="text-muted-foreground text-xs">(Rendered in order selected)</span></label>
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = METRIC_OPTIONS.every((m) => ss.metrics.includes(m.key));
                    setSs((p) => ({ ...p, metrics: allSelected ? [] : METRIC_OPTIONS.map((m) => m.key) }));
                    setSsSaved(false);
                  }}
                  className="cursor-pointer text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {METRIC_OPTIONS.every((m) => ss.metrics.includes(m.key)) ? "Uncheck All" : "Check All"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {METRIC_OPTIONS.map((m) => {
                  const isAutoDisabled = m.key === "today_dollar" && todayDollarAutoDisabled;
                  return (
                    <label key={m.key} className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted/50 ${isAutoDisabled ? "opacity-60" : ""}`}>
                      <span className="relative inline-flex">
                        <input
                          type="checkbox"
                          checked={ss.metrics.includes(m.key)}
                          onChange={() => toggleMetric(m.key)}
                          className="rounded border-border accent-emerald-600"
                        />
                        {isAutoDisabled && (
                          <span className="absolute inset-0 flex items-center justify-center text-red-500 text-[10px] font-bold pointer-events-none">x</span>
                        )}
                      </span>
                      <span className={`text-xs ${isAutoDisabled ? "text-red-400/70" : "text-foreground/80"}`}>{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Save button for screenshot config */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveScreenshot}
                disabled={ssSaving}
                className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {ssSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : ssSaved ? <Check className="h-4 w-4" /> : null}
                {ssSaving ? "Saving..." : ssSaved ? "Saved" : "Save Snapshot Settings"}
              </button>
              {ssError && <p className="text-xs text-red-400">{ssError}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
