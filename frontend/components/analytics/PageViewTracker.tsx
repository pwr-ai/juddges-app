"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { normalizeRoute } from "@/lib/analytics/route";
import { track } from "@/lib/analytics/track";

/**
 * Emits one `page_viewed` app event per client-side route change, keyed by the
 * route template (`/documents/[id]`), never the concrete path or query
 * string. Rides the same batched, fire-and-forget `track()` pipeline as every
 * other first-party event (same guest/session ids, same PII stripping), so it
 * adds no request of its own. Renders nothing.
 */
export function PageViewTracker(): null {
  const pathname = usePathname();
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    const route = normalizeRoute(pathname);
    // Dedupe on the concrete pathname: moving between two judgments is two
    // views, but a re-run of this effect (StrictMode, re-mount) is not.
    if (pathname === lastRoute.current) return;
    lastRoute.current = pathname;
    track("page_viewed", { route });
  }, [pathname]);

  return null;
}
