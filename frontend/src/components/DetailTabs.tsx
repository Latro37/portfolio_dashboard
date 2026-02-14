"use client";

import { useEffect, useState } from "react";
import { api, TransactionRow, CashFlowRow } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, DollarSign, TrendingDown, Plus } from "lucide-react";

interface Props {
  accountId?: string;
  onDataChange?: () => void;
}

export function DetailTabs({ accountId, onDataChange }: Props) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [cashFlows, setCashFlows] = useState<CashFlowRow[]>([]);
  const [txPage, setTxPage] = useState(0);
  const PAGE_SIZE = 50;

  // Manual cash flow form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualType, setManualType] = useState("deposit");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  // Resolve to a single account UUID (manual entries need a specific account, not "all:...")
  const resolvedSingleAccountId =
    accountId && !accountId.startsWith("all:") ? accountId : undefined;

  const handleAddManual = async () => {
    if (!resolvedSingleAccountId || !manualDate || !manualAmount) return;
    await api.addManualCashFlow({
      account_id: resolvedSingleAccountId,
      date: manualDate,
      type: manualType,
      amount: parseFloat(manualAmount),
      description: manualDesc,
    });
    // Reset form, reload cash flows, and notify parent to re-render charts
    setManualDate("");
    setManualAmount("");
    setManualDesc("");
    setShowManualForm(false);
    api.getCashFlows(accountId).then((data) => setCashFlows(data));
    onDataChange?.();
  };

  useEffect(() => {
    api.getTransactions(accountId, PAGE_SIZE, 0).then((d) => {
      setTransactions(d.transactions);
      setTxTotal(d.total);
    });
    api.getCashFlows(accountId).then((data) => setCashFlows(data));
  }, [accountId]);


  const loadTxPage = (page: number) => {
    setTxPage(page);
    api.getTransactions(accountId, PAGE_SIZE, page * PAGE_SIZE).then((d) => {
      setTransactions(d.transactions);
    });
  };

  const totalPages = Math.ceil(txTotal / PAGE_SIZE);

  return (
    <Card className="border-border/50">
      <Tabs defaultValue="transactions">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger data-testid="tab-transactions" value="transactions">Transactions</TabsTrigger>
          <TabsTrigger data-testid="tab-cashflows" value="cashflows">Non-Trade Activity</TabsTrigger>
        </TabsList>

        {/* Transactions */}
        <TabsContent value="transactions">
          <CardContent className="pt-4 overflow-y-auto" style={{ minHeight: 500, maxHeight: 500 }}>
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
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{tx.account_name ?? ""}</td>
                      <td className="py-2 pr-4 font-medium">{tx.symbol}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          tx.action === "buy" ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {tx.action === "buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {tx.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{tx.quantity.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">${tx.price.toFixed(2)}</td>
                      <td className="py-2 text-right tabular-nums">${tx.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                  <span>Page {txPage + 1} / {totalPages}</span>
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

        {/* Cash Flows */}
        <TabsContent value="cashflows">
          <CardContent className="pt-4 overflow-y-auto" style={{ minHeight: 500, maxHeight: 500 }}>
            {/* Manual entry form */}
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
                <p className="mb-2 text-xs font-medium text-muted-foreground">Add deposit or withdrawal</p>
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
                    <label className="mb-1 block text-xs text-muted-foreground">Amount ($)</label>
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
                    <label className="mb-1 block text-xs text-muted-foreground">Description</label>
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
                  </tr>
                </thead>
                <tbody>
                  {[...cashFlows].reverse().map((cf, i) => {
                    const icon = cf.type === "deposit" ? (
                      <DollarSign className="h-3 w-3 text-emerald-400" />
                    ) : cf.type === "dividend" ? (
                      <DollarSign className="h-3 w-3 text-blue-400" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-400" />
                    );
                    const color = cf.amount >= 0 ? "text-emerald-400" : "text-red-400";
                    return (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-2 pr-4 text-muted-foreground">{cf.date}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{cf.account_name ?? ""}</td>
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
                            {icon}
                            {cf.type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{cf.description}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${color}`}>
                          {cf.amount >= 0 ? "+" : ""}${Math.abs(cf.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

