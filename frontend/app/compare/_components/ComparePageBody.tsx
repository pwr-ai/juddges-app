"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { CompareRequest } from "@/lib/compare/types";

import { CompareContent } from "./CompareContent";
import { SavePairDialog } from "./SavePairDialog";

/**
 * `/compare`'s client body (issue #684, Task 17): wires `CompareContent`'s
 * `onSavePair` slot to `SavePairDialog`.
 *
 * Reads `?nl=` directly off `useSearchParams` for the dialog's default name,
 * rather than a second `useExtractedDataFilters()` instance -- that hook's
 * state is seeded from the URL once on mount and then owns writing it back
 * (see lib/extractions/use-extracted-data-filters.ts); a second instance
 * here would fork from `CompareContent`'s and the two would race each
 * other's `router.replace`. Reading the param directly has no such state to
 * fork: it is always in sync with whatever `CompareContent`'s hook last wrote.
 */
export function ComparePageBody() {
  const searchParams = useSearchParams();
  const nlQuestion = searchParams.get("nl") ?? undefined;
  const [saveRequest, setSaveRequest] = useState<CompareRequest | null>(null);

  return (
    <>
      <CompareContent onSavePair={setSaveRequest} />
      {saveRequest && (
        <SavePairDialog
          open
          onOpenChange={(open) => {
            if (!open) setSaveRequest(null);
          }}
          request={saveRequest}
          defaultName={nlQuestion}
          onSaved={() => setSaveRequest(null)}
        />
      )}
    </>
  );
}

export default ComparePageBody;
