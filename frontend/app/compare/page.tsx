import { Suspense } from "react";

import { CompareContent } from "./_components/CompareContent";

export const metadata = { title: "Compare PL / UK" };

/**
 * `/compare` — one structured filter, run for PL and UK at once, coded fields
 * side by side (issue #684, Spec C). The client content reads its filter
 * state from the URL (`?f=`/`?q=`/`?nl=`, same codec as /search/extractions),
 * which is why it sits behind a Suspense boundary (`useSearchParams`).
 */
export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-mono text-xs uppercase tracking-[0.18em] text-ink-soft" aria-busy>
          …
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
