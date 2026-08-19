"use client";

/**
 * Root-level error boundary.
 *
 * `app/error.tsx` cannot catch a throw inside its own parent, so any failure in
 * `app/layout.tsx` — the providers, the auth session, the sidebar — bypasses
 * every custom error UI and falls through to Next.js's unstyled default page.
 * This boundary replaces the root layout entirely, which is why it renders its
 * own `<html>` and `<body>`.
 *
 * Imports are kept deliberately narrow: this file is part of the root shell, so
 * anything it pulls in is paid for on every route. `ErrorCard` is imported from
 * its own module rather than the `lib/styles/components` barrel for that reason,
 * and the logging goes straight to the console instead of through the app logger.
 */

import { useEffect } from "react";

import { track } from "@/lib/analytics/track";
import { ErrorCard } from "@/lib/styles/components/error-card";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps): React.JSX.Element {
  useEffect(() => {
    console.error("[GlobalErrorBoundary] root layout error caught", error);

    track("error_boundary_triggered", {
      boundary: "global",
      error_name: error.name,
      message: error.message?.slice(0, 200),
      digest: error.digest ?? null,
    });
  }, [error]);

  // `reset` re-renders the tree that threw. When the failure is in the root
  // layout that often is not enough, so a hard reload is the fallback.
  const handleReload = () => {
    if (typeof reset === "function") {
      reset();
      return;
    }
    window.location.reload();
  };

  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background text-foreground">
        <main className="min-h-screen flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-2xl">
            <ErrorCard
              title="The Application Failed to Load"
              message="JuDDGES could not start this page — the error happened before any of the app's screens could render. Reloading usually clears it."
              onRetry={handleReload}
              retryLabel="Reload"
              secondaryAction={{
                label: "Go Home",
                onClick: () => window.location.assign("/"),
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
              If reloading does not help, please contact support and quote the
              time this happened.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
