"use client";

import { useEffect } from "react";
import type { ReactElement } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger";
import { ErrorCard, PageContainer } from "@/lib/styles/components";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SearchError({ error, reset }: ErrorProps): ReactElement {
  const router = useRouter();
  const errorLogger = logger.child("SearchErrorBoundary");

  useEffect(() => {
    errorLogger.error("Search page error caught", error, {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, errorLogger]);

  // Ensure reset is a function before passing it
  const handleRetry = reset && typeof reset === 'function' ? reset : () => {
    window.location.reload();
  };

  return (
    <PageContainer width="full" fillViewport className="!py-0">
      <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="w-full max-w-4xl px-6">
          <ErrorCard
            title="Search Error"
            message="We encountered an error while processing your search. Please try again. If this problem persists, please contact support."
            onRetry={handleRetry}
            retryLabel="Try Again"
            secondaryAction={{
              label: "New Search",
              onClick: () => router.push("/search"),
              icon: Search,
            }}
          >
            {process.env.NODE_ENV === "development" && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-left">
                <p className="text-sm font-mono text-destructive break-all">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}
          </ErrorCard>
        </div>
      </div>
    </PageContainer>
  );
}
