"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sensible default freshness (issue #178). A 4 h global staleTime
            // meant tab-focus showed day-old data and dashboards never
            // revalidated. Default to 5 min and let each hook opt into a
            // longer window (e.g. slow analytics keep their own 4 h
            // staleTime). gcTime stays generous so cached pages render
            // instantly while a background revalidation runs.
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 60 * 60 * 1000, // 1 hour
            // Revalidate stale data on tab focus / mount so interactive views
            // pick up fresh data without a manual refresh. Queries that are
            // still within their staleTime are served from cache and won't
            // refetch, so this stays cheap.
            refetchOnWindowFocus: true,
            refetchOnMount: true,
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
