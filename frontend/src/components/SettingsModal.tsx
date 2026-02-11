"use client";

import { useEffect, useState } from "react";
import { X, FolderOpen, Check, Loader2 } from "lucide-react";
import { api, AppConfig } from "@/lib/api";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [localPath, setLocalPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setConfig(cfg);
      setLocalPath(cfg.symphony_export?.local_path || "");
    }).catch(() => {});
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

        <div className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-6">Settings</h2>

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
        </div>
      </div>
    </div>
  );
}
