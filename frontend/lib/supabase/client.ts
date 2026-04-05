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

  // Use centralized environment variable access
  // This will throw a clear error if variables are missing or invalid
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
