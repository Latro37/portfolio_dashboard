import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccountInfo, ScreenshotConfig } from "@/lib/api";
import { invalidateAfterConfigWrite } from "@/lib/queryInvalidation";
import { getAccountsQueryFn, getConfigQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";
import { api } from "@/lib/api";
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

function applySetStateAction<T>(previous: T, value: SetStateAction<T>): T {
  return typeof value === "function"
    ? (value as (prevState: T) => T)(previous)
    : value;
}

export function useSettingsModalState(): Result {
  const queryClient = useQueryClient();
  const [localPathOverride, setLocalPathOverride] = useState<string | undefined>(
    undefined,
  );
  const [savingError, setSavingError] = useState("");
  const [saved, setSaved] = useState(false);

  const [ssOverride, setSsOverride] = useState<ScreenshotConfig | undefined>(
    undefined,
  );
  const [ssSaved, setSsSaved] = useState(false);
  const [ssError, setSsError] = useState("");
  const [todayDollarAutoDisabled, setTodayDollarAutoDisabled] = useState(false);

  const configQuery = useQuery({
    queryKey: queryKeys.config(),
    queryFn: getConfigQueryFn,
    staleTime: 300000,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: getAccountsQueryFn,
    staleTime: 300000,
  });

  const saveExportMutation = useMutation({
    mutationFn: (nextLocalPath: string) => api.saveSymphonyExportPath(nextLocalPath),
    onSuccess: async () => {
      await invalidateAfterConfigWrite(queryClient);
    },
  });

  const saveScreenshotMutation = useMutation({
    mutationFn: (nextConfig: ScreenshotConfig) => api.saveScreenshotConfig(nextConfig),
    onSuccess: async () => {
      await invalidateAfterConfigWrite(queryClient);
    },
  });

  const baseLocalPath = configQuery.data?.symphony_export?.local_path || "";
  const localPath = localPathOverride ?? baseLocalPath;
  const baseScreenshot = useMemo(
    () => ({ ...defaultScreenshot, ...(configQuery.data?.screenshot ?? {}) }),
    [configQuery.data?.screenshot],
  );
  const ss = ssOverride ?? baseScreenshot;

  const setLocalPath = useCallback((value: string) => {
    setLocalPathOverride(value);
  }, []);

  const setSs: Dispatch<SetStateAction<ScreenshotConfig>> = useCallback(
    (value) => {
      setSsOverride((previous) =>
        applySetStateAction(previous ?? baseScreenshot, value),
      );
    },
    [baseScreenshot],
  );

  const handleSave = useCallback(async () => {
    if (!localPath.trim()) {
      setSavingError("Path cannot be empty");
      return;
    }
    setSavingError("");
    setSaved(false);
    try {
      await saveExportMutation.mutateAsync(localPath.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSavingError("Failed to save export path");
    }
  }, [localPath, saveExportMutation]);

  const handleSaveScreenshot = useCallback(async () => {
    if (ss.enabled && !ss.local_path.trim()) {
      setSsError("Save folder is required when enabled");
      return;
    }
    setSsError("");
    setSsSaved(false);
    try {
      await saveScreenshotMutation.mutateAsync({
        ...ss,
        local_path: ss.local_path.trim(),
      });
      setSsSaved(true);
      setTimeout(() => setSsSaved(false), 2000);
    } catch {
      setSsError("Failed to save screenshot settings");
    }
  }, [ss, saveScreenshotMutation]);

  const toggleMetric = useCallback(
    (key: string) => {
      if (key === "today_dollar" && todayDollarAutoDisabled) {
        setTodayDollarAutoDisabled(false);
      }
      setSs((previous) => {
        const hasMetric = previous.metrics.includes(key);
        return {
          ...previous,
          metrics: hasMetric
            ? previous.metrics.filter((metric) => metric !== key)
            : [...previous.metrics, key],
        };
      });
      setSsSaved(false);
    },
    [todayDollarAutoDisabled, setSs],
  );

  const accountOptions = useMemo(
    () => buildAccountOptions(accountsQuery.data ?? []),
    [accountsQuery.data],
  );

  return {
    localPath,
    setLocalPath,
    saving: saveExportMutation.isPending,
    saved,
    setSaved,
    error: savingError,
    setError: setSavingError,
    handleSave,
    ss,
    setSs,
    ssSaving: saveScreenshotMutation.isPending,
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
