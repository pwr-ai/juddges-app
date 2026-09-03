"use client";

import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 60 * 60 * 1000, // 1 hour
            refetchOnWindowFocus: true,
            refetchOnMount: true,
            retry: 1, // Retry failed requests once
          },
        },
      })
  );

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </MotionConfig>
  );
}
