"use client";

import { useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger";
import { ErrorCard } from "@/lib/styles/components";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function CollectionsError({ error, reset }: ErrorProps) {
  const router = useRouter();
  const errorLogger = logger.child("CollectionsErrorBoundary");

  useEffect(() => {
    errorLogger.error("Collections page error caught", error, {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, errorLogger]);

  return (
    <div className="container py-16 max-w-2xl mx-auto px-6">
      <ErrorCard
        title="Collections Error"
        message="We encountered an error while loading your collections. Your data is safe."
        onRetry={reset}
        retryLabel="Reload Collections"
        secondaryAction={{
          label: "View Collections",
          onClick: () => router.push("/collections"),
          icon: FolderOpen,
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
        If this problem persists, please contact support. Your collections data is not affected.
      </p>
    </div>
  );
}
