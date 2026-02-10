"use client";

import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger";
import { ErrorCard } from "@/lib/styles/components";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ChatError({ error, reset }: ErrorProps): React.JSX.Element {
  const router = useRouter();
  const errorLogger = logger.child("ChatErrorBoundary");

  useEffect(() => {
    errorLogger.error("Chat page error caught", error, {
      digest: error.digest,
      message: error.message,
      stack: error.stack,
    });
  }, [error, errorLogger]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <ErrorCard
          title="Chat Error"
          message="We encountered an error in the chat interface. Your conversation history should be preserved."
          onRetry={reset}
          retryLabel="Reload Chat"
          secondaryAction={{
            label: "Start New Chat",
            onClick: () => router.push("/chat"),
            icon: MessageSquare,
          }}
          className="p-8 md:p-12"
        >
          {process.env.NODE_ENV === "development" && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-left max-w-md mx-auto">
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
        <p className="text-sm text-slate-600 dark:text-slate-400 text-center mt-4">
          If this problem persists, try clearing your browser cache or contact support.
        </p>
      </div>
    </div>
  );
}
