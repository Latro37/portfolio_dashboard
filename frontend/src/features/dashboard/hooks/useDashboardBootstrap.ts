import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { AccountInfo, ScreenshotConfig } from "@/lib/api";
import { getAccountsQueryFn, getConfigQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

type Result = {
  accounts: AccountInfo[];
  selectedCredential: string;
  selectedSubAccount: string;
  finnhubConfigured: boolean;
  isTestMode: boolean;
  screenshotConfig: ScreenshotConfig | null;
  setScreenshotConfig: Dispatch<SetStateAction<ScreenshotConfig | null>>;
  setSelectedCredential: Dispatch<SetStateAction<string>>;
  setSelectedSubAccount: Dispatch<SetStateAction<string>>;
};

function applySetStateAction<T>(
  previous: T,
  value: SetStateAction<T>,
): T {
  return typeof value === "function"
    ? (value as (prevState: T) => T)(previous)
    : value;
}

export function useDashboardBootstrap(): Result {
  const [selectedCredentialOverride, setSelectedCredentialOverride] = useState<string | null>(null);
  const [selectedSubAccountOverride, setSelectedSubAccountOverride] = useState<string | null>(null);
  const [screenshotConfigOverride, setScreenshotConfigOverride] = useState<ScreenshotConfig | null>(null);

  const { data: configData } = useQuery({
    queryKey: queryKeys.config(),
    queryFn: getConfigQueryFn,
    staleTime: 300000,
  });

  const { data: accountsData = [] } = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: getAccountsQueryFn,
    staleTime: 300000,
  });
  const defaultCredential = useMemo(() => {
    if (accountsData.length === 0) return "";
    return accountsData.some((account) => account.credential_name === "__TEST__")
      ? "__TEST__"
      : accountsData[0].credential_name;
  }, [accountsData]);

  const selectedCredential = selectedCredentialOverride ?? defaultCredential;

  const defaultSubAccount = useMemo(() => {
    if (!selectedCredential) return "";
    const subAccounts = accountsData.filter(
      (account) => account.credential_name === selectedCredential,
    );
    return subAccounts.length > 1 ? "all" : subAccounts[0]?.id || "";
  }, [accountsData, selectedCredential]);

  const selectedSubAccount = selectedSubAccountOverride ?? defaultSubAccount;

  const setSelectedCredential: Dispatch<SetStateAction<string>> = useCallback(
    (value) => {
      setSelectedCredentialOverride((previous) =>
        applySetStateAction(previous ?? selectedCredential, value),
      );
    },
    [selectedCredential],
  );

  const setSelectedSubAccount: Dispatch<SetStateAction<string>> = useCallback(
    (value) => {
      setSelectedSubAccountOverride((previous) =>
        applySetStateAction(previous ?? selectedSubAccount, value),
      );
    },
    [selectedSubAccount],
  );

  const setScreenshotConfig: Dispatch<SetStateAction<ScreenshotConfig | null>> = useCallback(
    (value) => {
      setScreenshotConfigOverride((previous) =>
        applySetStateAction(previous ?? configData?.screenshot ?? null, value),
      );
    },
    [configData?.screenshot],
  );

  const finnhubConfigured =
    configData?.finnhub_configured ?? Boolean(configData?.finnhub_api_key);
  const isTestMode = configData?.test_mode === true;
  const screenshotConfig = screenshotConfigOverride ?? configData?.screenshot ?? null;

  return {
    accounts: accountsData,
    selectedCredential,
    selectedSubAccount,
    finnhubConfigured,
    isTestMode,
    screenshotConfig,
    setScreenshotConfig,
    setSelectedCredential,
    setSelectedSubAccount,
  };
}
