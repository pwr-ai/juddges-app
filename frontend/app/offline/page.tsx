"use client";

import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, BookOpen } from "lucide-react";
import {
  ErrorCard,
  SecondaryButton,
  PageContainer,
} from "@/lib/styles/components";

export default function OfflinePage() {
  const router = useRouter();

  return (
    <PageContainer width="standard" fillViewport className="!py-0">
      <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md w-full px-6">
          <ErrorCard
            title="You're Offline"
            message="It looks like you've lost your internet connection. Some features may be unavailable until you're back online."
            onRetry={() => window.location.reload()}
            retryLabel="Try Again"
            showRetry={true}
          >
            <div className="flex items-center justify-center py-6">
              <WifiOff className="h-16 w-16 text-muted-foreground/50" />
            </div>
          </ErrorCard>
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              While offline, you can still:
            </p>
            <div className="flex gap-2 justify-center">
              <SecondaryButton
                onClick={() => router.push("/offline/documents")}
                icon={BookOpen}
                size="sm"
              >
                Saved Documents
              </SecondaryButton>
              <SecondaryButton
                onClick={() => window.location.reload()}
                icon={RefreshCw}
                size="sm"
              >
                Retry Connection
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
