import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env/client";
import { logger } from "@/lib/logger";

/**
 * Create a Supabase client for client-side operations
 * Uses runtime environment variables injected via docker-entrypoint.sh
 *
 * @returns Supabase browser client instance
 */
export function createClient() {
  // During build time, return a dummy client if vars are placeholders
  // This allows the build to complete without crashing
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    logger.warn('Building with placeholder Supabase credentials - will be replaced at runtime');
    return createBrowserClient('https://placeholder.supabase.co', 'placeholder-key');
  }

  const missing = [
    ...(env.NEXT_PUBLIC_SUPABASE_URL ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]),
    ...(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? [] : ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  ];
  if (missing.length > 0) {
    // Named error instead of the generic @supabase/ssr message: the values
    // come from window.__env, filled by the root layout and /runtime-env.js.
    throw new Error(
      `Supabase browser configuration is missing: ${missing.join(", ")}. ` +
        "Check GET /runtime-env.js on this host and the frontend container's environment."
    );
  }

  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
