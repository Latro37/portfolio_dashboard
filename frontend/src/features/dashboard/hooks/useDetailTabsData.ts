import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, CashFlowRow } from "@/lib/api";
import { invalidateAfterManualCashFlow } from "@/lib/queryInvalidation";
import { getCashFlowsQueryFn, getTransactionsQueryFn } from "@/lib/queryFns";
import { queryKeys } from "@/lib/queryKeys";

type Args = {
  accountId?: string;
  onDataChange?: () => void;
};

const PAGE_SIZE = 50;

export function useDetailTabsData({ accountId, onDataChange }: Args) {
  const queryClient = useQueryClient();
  const [txPagesByAccount, setTxPagesByAccount] = useState<Record<string, number>>({});

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualType, setManualType] = useState("deposit");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  const resolvedSingleAccountId =
    accountId && accountId !== "all" && !accountId.startsWith("all:")
      ? accountId
      : undefined;

  const pageScopeKey = accountId ?? "__all__";
  const txPage = txPagesByAccount[pageScopeKey] ?? 0;
  const txOffset = txPage * PAGE_SIZE;
  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactions({
      accountId,
      limit: PAGE_SIZE,
      offset: txOffset,
    }),
    queryFn: () =>
      getTransactionsQueryFn({
        accountId,
        limit: PAGE_SIZE,
        offset: txOffset,
      }),
    staleTime: 60000,
  });

  const cashFlowsQuery = useQuery({
    queryKey: queryKeys.cashFlows(accountId),
    queryFn: () => getCashFlowsQueryFn(accountId),
    staleTime: 60000,
  });

  const transactions = transactionsQuery.data?.transactions ?? [];
  const txTotal = transactionsQuery.data?.total ?? 0;
  const cashFlows: CashFlowRow[] = cashFlowsQuery.data ?? [];
  const manualCashFlowMutation = useMutation({
    mutationFn: api.addManualCashFlow,
    onSuccess: async (_, variables) => {
      await invalidateAfterManualCashFlow(queryClient, variables.account_id);
      await cashFlowsQuery.refetch();
      await transactionsQuery.refetch();
    },
  });
  const manualCashFlowDeleteMutation = useMutation({
    mutationFn: ({ cashFlowId }: { cashFlowId: number; accountId: string }) =>
      api.deleteManualCashFlow(cashFlowId),
    onSuccess: async (_, variables) => {
      await invalidateAfterManualCashFlow(queryClient, variables.accountId);
      await cashFlowsQuery.refetch();
      await transactionsQuery.refetch();
    },
  });

  const handleAddManual = async () => {
    if (!resolvedSingleAccountId || !manualDate || !manualAmount) return;

    await manualCashFlowMutation.mutateAsync({
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
    onDataChange?.();
  };

  const handleDeleteManual = async (cashFlow: CashFlowRow) => {
    if (!cashFlow.is_manual || !cashFlow.account_id) return;
    await manualCashFlowDeleteMutation.mutateAsync({
      cashFlowId: cashFlow.id,
      accountId: cashFlow.account_id,
    });
    onDataChange?.();
  };

  const loadTxPage = (page: number) => {
    setTxPagesByAccount((previous) => ({
      ...previous,
      [pageScopeKey]: page,
    }));
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
    handleDeleteManual,
  };
}
