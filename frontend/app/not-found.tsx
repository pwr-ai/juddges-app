"use client";

import { useRouter } from "next/navigation";
import { Home, Search, FileQuestion } from "lucide-react";
import { ErrorCard, SecondaryButton, PageContainer } from "@/lib/styles/components";

export default function NotFound() {
  const router = useRouter();

  return (
    <PageContainer width="standard" fillViewport className="!py-0">
      <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md w-full px-6">
          <ErrorCard
            title="Page Not Found"
            message="This page doesn't exist on JuDDGES. It may have been moved or deleted."
            onRetry={() => router.back()}
            retryLabel="Go Back"
            showRetry={true}
            secondaryAction={{
              label: "Go Home",
              onClick: () => router.push("/"),
              icon: Home,
            }}
          >
            <div className="flex items-center justify-center py-6">
              <FileQuestion className="h-16 w-16 text-muted-foreground/50" />
            </div>
          </ErrorCard>
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              You might be looking for:
            </p>
            <div className="flex justify-center">
              <SecondaryButton
                onClick={() => router.push("/search")}
                icon={Search}
                size="sm"
              >
                Search
              </SecondaryButton>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
