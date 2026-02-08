"use client";

import { useEffect, useRef, useState } from "react";
import { api, TransactionRow, CashFlowRow } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, DollarSign, TrendingDown } from "lucide-react";

export function DetailTabs() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [cashFlows, setCashFlows] = useState<CashFlowRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown>[]>([]);
  const [txPage, setTxPage] = useState(0);
  const PAGE_SIZE = 50;
  const metricsRef = useRef<HTMLDivElement>(null);
  const [metricsHeight, setMetricsHeight] = useState<number | null>(null);

  useEffect(() => {
    api.getTransactions(PAGE_SIZE, 0).then((d) => {
      setTransactions(d.transactions);
      setTxTotal(d.total);
    });
    api.getCashFlows().then((data) => setCashFlows(data));
    fetch((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api") + "/metrics")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMetrics(data);
        }
      });
  }, []);

  useEffect(() => {
    if (metricsRef.current) {
      setMetricsHeight(metricsRef.current.scrollHeight);
    }
  }, [metrics]);

  const loadTxPage = (page: number) => {
    setTxPage(page);
    api.getTransactions(PAGE_SIZE, page * PAGE_SIZE).then((d) => {
      setTransactions(d.transactions);
    });
  };

  const totalPages = Math.ceil(txTotal / PAGE_SIZE);

  return (
    <Card className="border-border/50">
      <Tabs defaultValue="metrics">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="metrics">All Metrics</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="cashflows">Non-Trade Activity</TabsTrigger>
        </TabsList>

        {/* Transactions */}
        <TabsContent value="transactions">
          <CardContent className="pt-4 overflow-y-auto" style={metricsHeight ? { maxHeight: metricsHeight } : { maxHeight: 500 }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
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
                    className="rounded px-2 py-1 hover:bg-muted disabled:opacity-30"
                    disabled={txPage === 0}
                    onClick={() => loadTxPage(txPage - 1)}
                  >
                    Prev
                  </button>
                  <span>Page {txPage + 1} / {totalPages}</span>
                  <button
                    className="rounded px-2 py-1 hover:bg-muted disabled:opacity-30"
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
          <CardContent className="pt-4 overflow-y-auto" style={metricsHeight ? { maxHeight: metricsHeight } : { maxHeight: 500 }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
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

        {/* All Metrics (latest row) */}
        <TabsContent value="metrics">
          <CardContent className="pt-4" ref={metricsRef}>
            {metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(metrics[metrics.length - 1]).map(([key, value]) => {
                  if (key === "date") return null;
                  const label = key
                    .replace(/_/g, " ")
                    .replace(/\bpct\b/g, "%")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  const numVal = typeof value === "number" ? value : 0;
                  const display = key.includes("pct") || key.includes("return") || key.includes("rate") ||
                    key.includes("drawdown") || key.includes("volatility") || key.includes("day_pct")
                    ? numVal.toFixed(2) + "%"
                    : key.includes("dollar")
                    ? "$" + numVal.toLocaleString(undefined, { minimumFractionDigits: 2 })
                    : key.includes("ratio") || key.includes("factor")
                    ? numVal.toFixed(4)
                    : String(value);
                  return (
                    <div key={key} className="flex justify-between gap-2 border-b border-border/20 pb-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums">{display}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

