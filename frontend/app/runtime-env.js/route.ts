import { NextResponse } from "next/server";

import { buildRuntimeEnvScript, missingPublicRuntimeEnv } from "@/lib/env/server";
import logger from "@/lib/logger";

const log = logger.child("runtime-env");

/**
 * GET /runtime-env.js
 *
 * Serves the public runtime configuration as a tiny script that merges into
 * `window.__env`. It is loaded synchronously from the root layout `<head>`
 * before any React code runs, so `lib/env/client.ts` always sees the values
 * of the *running* container, not the ones frozen into prerendered HTML at
 * build time.
 *
 * Always dynamic and never cached: the whole point is that the response
 * reflects the current process environment. The service worker refuses to
 * cache `no-store` responses, and the middleware matcher skips `*.js` paths,
 * so this is reachable before login.
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const missing = missingPublicRuntimeEnv();
  if (missing.length > 0) {
    // Still 200: the inline baseline in the HTML may cover these. The browser
    // client raises a named error if the final value is empty.
    log.warn("Public runtime env is incomplete", { missing });
  }
  return new NextResponse(buildRuntimeEnvScript(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
