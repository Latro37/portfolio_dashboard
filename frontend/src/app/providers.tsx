"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";

type Props = {
  children: React.ReactNode;
};

export function Providers({ children }: Props) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
