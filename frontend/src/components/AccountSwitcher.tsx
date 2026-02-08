"use client";

import { AccountInfo } from "@/lib/api";
import { ChevronDown } from "lucide-react";

interface Props {
  accounts: AccountInfo[];
  selectedCredential: string;
  selectedSubAccount: string; // account UUID or "all"
  onCredentialChange: (credName: string) => void;
  onSubAccountChange: (accountId: string) => void;
}

export function AccountSwitcher({
  accounts,
  selectedCredential,
  selectedSubAccount,
  onCredentialChange,
  onSubAccountChange,
}: Props) {
  // Get unique credential names
  const credentialNames = [...new Set(accounts.map((a) => a.credential_name))];

  // Sub-accounts for the selected credential
  const subAccounts = accounts.filter(
    (a) => a.credential_name === selectedCredential
  );

  // Map account_type to friendly short names for the sub-account dropdown
  const typeLabel: Record<string, string> = {
    INDIVIDUAL: "Stocks",
    IRA_ROTH: "Roth IRA",
    IRA_TRADITIONAL: "Traditional IRA",
    BUSINESS: "Business",
  };

  return (
    <div className="flex items-center gap-2">
      {/* Credential (Composer account) selector — only show if >1 */}
      {credentialNames.length > 1 && (
        <div className="relative">
          <select
            value={selectedCredential}
            onChange={(e) => onCredentialChange(e.target.value)}
            className="appearance-none rounded-md border border-border bg-muted px-3 py-1.5 pr-8 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {credentialNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      )}

      {/* Sub-account selector */}
      <div className="relative">
        <select
          value={selectedSubAccount}
          onChange={(e) => onSubAccountChange(e.target.value)}
          className="appearance-none rounded-md border border-border bg-muted px-3 py-1.5 pr-8 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {subAccounts.length > 1 && <option value="all">All Accounts</option>}
          {subAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {typeLabel[a.account_type] || a.account_type}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
