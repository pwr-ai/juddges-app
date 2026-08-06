"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import logger from "@/lib/logger";
import { ErrorCard, PageContainer } from "@/lib/styles/components";

export default function SchemaDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    logger.error("Schema detail page failed to load", error);
  }, [error]);

  return (
    <PageContainer fillViewport className="flex items-center justify-center">
      <ErrorCard
        title="Schema temporarily unavailable"
        message="The schema service could not load this schema. Please try again."
        onRetry={reset}
        retryLabel="Retry"
        secondaryAction={{
          label: "Back to Schemas",
          onClick: () => router.push("/schemas"),
          icon: ArrowLeft,
        }}
      />
    </PageContainer>
  );
}
