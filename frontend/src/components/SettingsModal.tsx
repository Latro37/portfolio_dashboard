"use client";

import { useEffect, useState } from "react";
import { X, FolderOpen, Check, Loader2, Camera } from "lucide-react";
import { api, AppConfig, ScreenshotConfig, AccountInfo } from "@/lib/api";
import { METRIC_OPTIONS, DEFAULT_METRICS } from "./SnapshotView";

const CHART_MODES = [
  { value: "twr", label: "TWR" },
  { value: "portfolio", label: "Portfolio Value" },
  { value: "mwr", label: "MWR" },
  { value: "drawdown", label: "Drawdown" },
];

const PERIOD_OPTIONS = [
  { value: "1W", label: "1 Week" },
  { value: "1M", label: "1 Month" },
  { value: "3M", label: "3 Months" },
  { value: "YTD", label: "Year to Date" },
  { value: "1Y", label: "1 Year" },
  { value: "ALL", label: "All Time" },
  { value: "custom", label: "Custom Start Date" },
];

interface Props {
  onClose: () => void;
}

const defaultScreenshot: ScreenshotConfig = {
  enabled: false,
  local_path: "",
  account_id: "",
  chart_mode: "twr",
  period: "ALL",
  custom_start: "",
  hide_portfolio_value: false,
  metrics: [...DEFAULT_METRICS],
  benchmarks: [],
};

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Screenshot config state
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [ss, setSs] = useState<ScreenshotConfig>({ ...defaultScreenshot });
  const [ssSaving, setSsSaving] = useState(false);
  const [ssSaved, setSsSaved] = useState(false);
  const [ssError, setSsError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setConfig(cfg);
      setLocalPath(cfg.symphony_export?.local_path || "");
      if (cfg.screenshot) {
        setSs({ ...defaultScreenshot, ...cfg.screenshot });
      }
    }).catch(() => {});
    api.getAccounts().then(setAccounts).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!localPath.trim()) {
      setError("Path cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.saveSymphonyExportPath(localPath.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save export path");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScreenshot = async () => {
    if (ss.enabled && !ss.local_path.trim()) {
      setSsError("Save folder is required when enabled");
      return;
    }
    setSsSaving(true);
    setSsError("");
    setSsSaved(false);
    try {
      await api.saveScreenshotConfig({ ...ss, local_path: ss.local_path.trim() });
      setSsSaved(true);
      setTimeout(() => setSsSaved(false), 2000);
    } catch {
      setSsError("Failed to save screenshot settings");
    } finally {
      setSsSaving(false);
    }
  };

  const toggleMetric = (key: string) => {
    setSs((prev) => {
      const has = prev.metrics.includes(key);
      return {
        ...prev,
        metrics: has
          ? prev.metrics.filter((m) => m !== key)
          : [...prev.metrics, key],
      };
    });
    setSsSaved(false);
  };

  // Build account options matching dashboard's AccountSwitcher
  const credentialNames = [...new Set(accounts.map((a) => a.credential_name))];
  const typeLabel: Record<string, string> = {
    INDIVIDUAL: "Taxable",
    IRA_ROTH: "Roth IRA",
    ROTH_IRA: "Roth IRA",
    IRA_TRADITIONAL: "Traditional IRA",
    TRADITIONAL_IRA: "Traditional IRA",
    BUSINESS: "Business",
  };

  const accountOptions: { value: string; label: string }[] = [];
  if (accounts.length > 1) {
    accountOptions.push({ value: "all", label: "All Accounts" });
  }
  for (const cred of credentialNames) {
    const subs = accounts.filter((a) => a.credential_name === cred);
    if (subs.length > 1) {
      accountOptions.push({ value: `all:${cred}`, label: `${cred} — All` });
    }
    for (const sub of subs) {
      const tl = typeLabel[sub.account_type] || sub.account_type;
      accountOptions.push({
        value: sub.id,
        label: credentialNames.length > 1 ? `${cred}: ${tl}` : tl,
      });
    }
  }

  return (
    <div
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
                  placeholder="C:\Users\you\Documents\SymphonyBackups"
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
              <span className="text-sm text-foreground/80">Enable daily screenshot</span>
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
                placeholder="C:\Users\you\Documents\PortfolioSnapshots"
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
                onChange={(e) => { setSs((p) => ({ ...p, hide_portfolio_value: e.target.checked })); setSsSaved(false); }}
                className="rounded border-border accent-emerald-600"
              />
              <span className="text-sm text-foreground/80">Hide portfolio value</span>
            </label>

            {/* Benchmark tickers */}
            <div className="space-y-2 mb-2">
              <label className="text-sm text-foreground/80">
                Benchmark Overlays{" "}
                <span className="text-muted-foreground text-xs">(up to 3 tickers, e.g. SPY)</span>
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
                      ✕
                    </button>
                  </span>
                ))}
                {(ss.benchmarks || []).length < 3 && (
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
                  {METRIC_OPTIONS.every((m) => ss.metrics.includes(m.key)) ? "None" : "All"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {METRIC_OPTIONS.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={ss.metrics.includes(m.key)}
                      onChange={() => toggleMetric(m.key)}
                      className="rounded border-border accent-emerald-600"
                    />
                    <span className="text-xs text-foreground/80">{m.label}</span>
                  </label>
                ))}
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
