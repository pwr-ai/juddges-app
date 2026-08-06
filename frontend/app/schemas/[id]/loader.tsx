"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import SchemaDetailFailure from "@/components/schemas/SchemaDetailFailure";
import { normalizeExtractionSchema } from "@/lib/schemas/detail-transport";
import { PageContainer } from "@/lib/styles/components";
import type { ExtractionSchema } from "@/types/extraction_schemas";

import SchemaDetailClient from "./client";

interface SchemaDetailLoaderProps {
  schemaId: string;
}

export default function SchemaDetailLoader({
  schemaId,
}: SchemaDetailLoaderProps): React.JSX.Element {
  const [schema, setSchema] = useState<ExtractionSchema | null>(null);
  const [failureStatus, setFailureStatus] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSchema(null);
    setFailureStatus(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/schemas/${encodeURIComponent(schemaId)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) {
          if (!controller.signal.aborted) setFailureStatus(response.status || 503);
          return;
        }

        const payload: unknown = await response.json();
        const normalized = normalizeExtractionSchema(payload);
        if (!normalized || normalized.id !== schemaId) {
          if (!controller.signal.aborted) setFailureStatus(502);
          return;
        }
        if (!controller.signal.aborted) setSchema(normalized);
      } catch (error) {
        if (
          !controller.signal.aborted &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
          setFailureStatus(503);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [schemaId]);

  if (failureStatus !== null) {
    return <SchemaDetailFailure status={failureStatus} />;
  }
  if (schema) return <SchemaDetailClient initialSchema={schema} />;

  return (
    <PageContainer fillViewport className="flex items-center justify-center">
      <div
        role="status"
        aria-label="Loading schema"
        className="flex items-center gap-3 text-[var(--ink-soft)]"
      >
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        <span>Loading schema…</span>
      </div>
    </PageContainer>
  );
}
