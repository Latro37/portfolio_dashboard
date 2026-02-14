import { useEffect, useState } from "react";

import { api, CashFlowRow, TransactionRow } from "@/lib/api";

type Args = {
  accountId?: string;
  onDataChange?: () => void;
};

const PAGE_SIZE = 50;

export function useDetailTabsData({ accountId, onDataChange }: Args) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [cashFlows, setCashFlows] = useState<CashFlowRow[]>([]);
  const [txPage, setTxPage] = useState(0);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualType, setManualType] = useState("deposit");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  const resolvedSingleAccountId =
    accountId && accountId !== "all" && !accountId.startsWith("all:")
      ? accountId
      : undefined;

  const handleAddManual = async () => {
    if (!resolvedSingleAccountId || !manualDate || !manualAmount) return;

    await api.addManualCashFlow({
      account_id: resolvedSingleAccountId,
      date: manualDate,
      type: manualType,
      amount: parseFloat(manualAmount),
      description: manualDesc,
    });

    setManualDate("");
    setManualAmount("");
    setManualDesc("");
    setShowManualForm(false);
    api.getCashFlows(accountId).then((data) => setCashFlows(data));
    onDataChange?.();
  };

  useEffect(() => {
    api.getTransactions(accountId, PAGE_SIZE, 0).then((data) => {
      setTransactions(data.transactions);
      setTxTotal(data.total);
    });
    api.getCashFlows(accountId).then((data) => setCashFlows(data));
  }, [accountId]);

  const loadTxPage = (page: number) => {
    setTxPage(page);
    api.getTransactions(accountId, PAGE_SIZE, page * PAGE_SIZE).then((data) => {
      setTransactions(data.transactions);
    });
  };

  const totalPages = Math.ceil(txTotal / PAGE_SIZE);

  return {
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
  };
}
