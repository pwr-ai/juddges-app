"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache for 4 hours (matching backend TTL)
            staleTime: 4 * 60 * 60 * 1000, // 4 hours
            gcTime: 4 * 60 * 60 * 1000, // 4 hours (replaces cacheTime)
            refetchOnWindowFocus: false, // Don't refetch on tab focus
            refetchOnMount: false, // Use cached data if available
            retry: 1, // Retry failed requests once
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
