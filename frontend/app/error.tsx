"use client";

import { useEffect } from "react";
import { Home } from "lucide-react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger";
import { ErrorCard, PageContainer } from "@/lib/styles/components";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps): React.JSX.Element {
  const router = useRouter();
  const errorLogger = logger.child("AppErrorBoundary");

  useEffect(() => {
    errorLogger.error("Application error caught", error, {
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
    <PageContainer width="compact" fillViewport className="!py-0">
      <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="w-full max-w-2xl px-6">
          <ErrorCard
            title="Something Went Wrong"
            message="JuDDGES encountered an unexpected error. Please try again."
            onRetry={handleRetry}
            retryLabel="Try Again"
            secondaryAction={{
              label: "Go Home",
              onClick: () => router.push("/"),
              icon: Home,
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
          <p className="text-sm text-muted-foreground text-center mt-4">
            If this problem persists, please refresh the page or contact support.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
