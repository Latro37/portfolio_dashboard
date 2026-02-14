import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

import { api, AccountInfo, ScreenshotConfig } from "@/lib/api";
import { defaultScreenshot } from "@/features/settings/options";

type AccountOption = { value: string; label: string };

type Result = {
  localPath: string;
  setLocalPath: (value: string) => void;
  saving: boolean;
  saved: boolean;
  setSaved: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  handleSave: () => Promise<void>;
  ss: ScreenshotConfig;
  setSs: Dispatch<SetStateAction<ScreenshotConfig>>;
  ssSaving: boolean;
  ssSaved: boolean;
  setSsSaved: Dispatch<SetStateAction<boolean>>;
  ssError: string;
  handleSaveScreenshot: () => Promise<void>;
  todayDollarAutoDisabled: boolean;
  setTodayDollarAutoDisabled: (value: boolean) => void;
  toggleMetric: (key: string) => void;
  accountOptions: AccountOption[];
};

function buildAccountOptions(accounts: AccountInfo[]): AccountOption[] {
  const credentialNames = [...new Set(accounts.map((a) => a.credential_name))];
  const typeLabel: Record<string, string> = {
    INDIVIDUAL: "Taxable",
    IRA_ROTH: "Roth IRA",
    ROTH_IRA: "Roth IRA",
    IRA_TRADITIONAL: "Traditional IRA",
    TRADITIONAL_IRA: "Traditional IRA",
    BUSINESS: "Business",
  };

  const options: AccountOption[] = [];
  if (accounts.length > 1) {
    options.push({ value: "all", label: "All Accounts" });
  }
  for (const credentialName of credentialNames) {
    const subAccounts = accounts.filter(
      (account) => account.credential_name === credentialName,
    );
    if (subAccounts.length > 1) {
      options.push({
        value: `all:${credentialName}`,
        label: `${credentialName} - All`,
      });
    }
    for (const subAccount of subAccounts) {
      const type = typeLabel[subAccount.account_type] || subAccount.account_type;
      options.push({
        value: subAccount.id,
        label: credentialNames.length > 1 ? `${credentialName}: ${type}` : type,
      });
    }
  }

  return options;
}

export function useSettingsModalState(): Result {
  const [localPath, setLocalPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [ss, setSs] = useState<ScreenshotConfig>({ ...defaultScreenshot });
  const [ssSaving, setSsSaving] = useState(false);
  const [ssSaved, setSsSaved] = useState(false);
  const [ssError, setSsError] = useState("");
  const [todayDollarAutoDisabled, setTodayDollarAutoDisabled] = useState(false);

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        setLocalPath(cfg.symphony_export?.local_path || "");
        if (cfg.screenshot) {
          setSs({ ...defaultScreenshot, ...cfg.screenshot });
        }
      })
      .catch(() => {});

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
    if (key === "today_dollar" && todayDollarAutoDisabled) {
      setTodayDollarAutoDisabled(false);
    }
    setSs((prev) => {
      const has = prev.metrics.includes(key);
      return {
        ...prev,
        metrics: has
          ? prev.metrics.filter((metric) => metric !== key)
          : [...prev.metrics, key],
      };
    });
    setSsSaved(false);
  };

  const accountOptions = useMemo(() => buildAccountOptions(accounts), [accounts]);

  return {
    localPath,
    setLocalPath,
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
  };
}
