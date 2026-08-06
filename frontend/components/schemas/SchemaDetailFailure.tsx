"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { ErrorCard, PageContainer } from "@/lib/styles/components";

export default function SchemaDetailFailure({
  status,
}: {
  status: number;
}): React.JSX.Element {
  const router = useRouter();
  const timedOut = status === 504;
  return (
    <PageContainer fillViewport className="flex items-center justify-center">
      <ErrorCard
        title={timedOut ? "Schema request timed out" : "Schema temporarily unavailable"}
        message={
          timedOut
            ? "The schema service took too long to respond. Please try again."
            : "The schema service could not load this schema. Please try again."
        }
        onRetry={() => window.location.reload()}
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
