"use client";

import { ArrowDownRight, ArrowUpRight, DollarSign, Plus, Trash2, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDetailTabsData } from "@/features/dashboard/hooks/useDetailTabsData";

interface Props {
  accountId?: string;
  onDataChange?: () => void;
}

export function DetailTabs({ accountId, onDataChange }: Props) {
  const {
    transactions,
    txTotal,
    cashFlows,
    txPage,
    totalPages,
    loadTxPage,
    showManualForm,
    setShowManualForm,
    manualDate,
    setManualDate,
    manualType,
    setManualType,
    manualAmount,
    setManualAmount,
    manualDesc,
    setManualDesc,
    resolvedSingleAccountId,
    handleAddManual,
    handleDeleteManual,
  } = useDetailTabsData({
    accountId,
    onDataChange,
  });

  return (
    <Card className="border-border/50">
      <Tabs defaultValue="transactions">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger data-testid="tab-transactions" value="transactions">
            Transactions
          </TabsTrigger>
          <TabsTrigger data-testid="tab-cashflows" value="cashflows">
            Non-Trade Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <CardContent
            className="pt-4 overflow-y-auto"
            style={{ minHeight: 500, maxHeight: 500 }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Account</th>
                    <th className="pb-2 pr-4">Symbol</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4 text-right">Quantity</th>
                    <th className="pb-2 pr-4 text-right">Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 pr-4 text-muted-foreground">{tx.date}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {tx.account_name ?? ""}
                      </td>
                      <td className="py-2 pr-4 font-medium">{tx.symbol}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            tx.action === "buy" ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {tx.action === "buy" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {tx.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {tx.quantity.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        ${tx.price.toFixed(2)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        $
                        {tx.total_amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{txTotal.toLocaleString()} transactions</span>
                <div className="flex gap-2">
                  <button
                    className="cursor-pointer rounded px-2 py-1 hover:bg-muted disabled:opacity-30"
                    disabled={txPage === 0}
                    onClick={() => loadTxPage(txPage - 1)}
                  >
                    Prev
                  </button>
                  <span>
                    Page {txPage + 1} / {totalPages}
                  </span>
                  <button
                    className="cursor-pointer rounded px-2 py-1 hover:bg-muted disabled:opacity-30"
                    disabled={txPage >= totalPages - 1}
                    onClick={() => loadTxPage(txPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </TabsContent>

        <TabsContent value="cashflows">
          <CardContent
            className="pt-4 overflow-y-auto"
            style={{ minHeight: 500, maxHeight: 500 }}
          >
            {!showManualForm ? (
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowManualForm(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Manual Entry
                </Button>
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Add deposit or withdrawal
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                    <select
                      value={manualType}
                      onChange={(e) => setManualType(e.target.value)}
                      className="rounded border border-border bg-background px-2 py-1 text-sm"
                    >
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Amount ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-28 rounded border border-border bg-background px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Description
                    </label>
                    <input
                      type="text"
                      value={manualDesc}
                      onChange={(e) => setManualDesc(e.target.value)}
                      placeholder="Optional"
                      className="w-36 rounded border border-border bg-background px-2 py-1 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!manualDate || !manualAmount || !resolvedSingleAccountId}
                    onClick={handleAddManual}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowManualForm(false)}>
                    Cancel
                  </Button>
                </div>
                {!resolvedSingleAccountId && (
                  <p className="mt-2 text-xs text-yellow-500">
                    Select a specific sub-account (not &quot;All&quot;) to add a manual entry.
                  </p>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Account</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cashFlows].reverse().map((cashFlow, i) => {
                    const icon =
                      cashFlow.type === "deposit" ? (
                        <DollarSign className="h-3 w-3 text-emerald-400" />
                      ) : cashFlow.type === "dividend" ? (
                        <DollarSign className="h-3 w-3 text-blue-400" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      );
                    const color =
                      cashFlow.amount >= 0 ? "text-emerald-400" : "text-red-400";
                    return (
                      <tr key={cashFlow.id ?? i} className="border-b border-border/30">
                        <td className="py-2 pr-4 text-muted-foreground">{cashFlow.date}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {cashFlow.account_name ?? ""}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
                            {icon}
                            {cashFlow.type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {cashFlow.description}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums font-medium ${color}`}
                        >
                          {cashFlow.amount >= 0 ? "+" : ""}$
                          {Math.abs(cashFlow.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          {cashFlow.is_manual ? (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-500/40 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                              onClick={() => handleDeleteManual(cashFlow.id)}
                              aria-label="Delete manual entry"
                              title="Delete manual entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
