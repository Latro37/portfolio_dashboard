import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

import { api, AccountInfo, ScreenshotConfig } from "@/lib/api";

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

export function useDashboardBootstrap(): Result {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [selectedCredential, setSelectedCredential] = useState("");
  const [selectedSubAccount, setSelectedSubAccount] = useState("");
  const [finnhubConfigured, setFinnhubConfigured] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [screenshotConfig, setScreenshotConfig] = useState<ScreenshotConfig | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    api
      .getConfig()
      .then((config) => {
        if (!active) return;
        setFinnhubConfigured(config.finnhub_configured ?? !!config.finnhub_api_key);
        setIsTestMode(config.test_mode === true);
        if (config.screenshot) {
          setScreenshotConfig(config.screenshot);
        }
      })
      .catch(() => undefined);

    api
      .getAccounts()
      .then((loadedAccounts) => {
        if (!active) return;
        setAccounts(loadedAccounts);
        if (loadedAccounts.length === 0) return;

        const preferredCredential = loadedAccounts.some(
          (account) => account.credential_name === "__TEST__",
        )
          ? "__TEST__"
          : loadedAccounts[0].credential_name;
        setSelectedCredential(preferredCredential);

        const subAccounts = loadedAccounts.filter(
          (account) => account.credential_name === preferredCredential,
        );
        setSelectedSubAccount(
          subAccounts.length > 1 ? "all" : subAccounts[0]?.id || "",
        );
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return {
    accounts,
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
