import { type Dispatch, type SetStateAction, useCallback, useMemo } from "react";

import type { AccountInfo } from "@/lib/api";

type Args = {
  accounts: AccountInfo[];
  selectedCredential: string;
  selectedSubAccount: string;
  setSelectedCredential: Dispatch<SetStateAction<string>>;
  setSelectedSubAccount: Dispatch<SetStateAction<string>>;
  resetForAccountChange: () => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
};

type Result = {
  showAccountColumn: boolean;
  handleCredentialChange: (credentialName: string) => void;
  handleSubAccountChange: (accountId: string) => void;
};

export function useDashboardAccountScope({
  accounts,
  selectedCredential,
  selectedSubAccount,
  setSelectedCredential,
  setSelectedSubAccount,
  resetForAccountChange,
  setLoading,
}: Args): Result {
  const showAccountColumn = useMemo(
    () => selectedCredential === "__all__" || selectedSubAccount === "all",
    [selectedCredential, selectedSubAccount],
  );

  const handleCredentialChange = useCallback(
    (credentialName: string) => {
      setSelectedCredential(credentialName);
      if (credentialName === "__all__") {
        setSelectedSubAccount("all");
      } else {
        const subAccounts = accounts.filter(
          (account) => account.credential_name === credentialName,
        );
        setSelectedSubAccount(subAccounts.length > 1 ? "all" : subAccounts[0]?.id || "");
      }
      resetForAccountChange();
    },
    [accounts, setSelectedCredential, setSelectedSubAccount, resetForAccountChange],
  );

  const handleSubAccountChange = useCallback(
    (accountId: string) => {
      setSelectedSubAccount(accountId);
      resetForAccountChange();
      setLoading(true);
    },
    [setSelectedSubAccount, resetForAccountChange, setLoading],
  );

  return {
    showAccountColumn,
    handleCredentialChange,
    handleSubAccountChange,
  };
}
