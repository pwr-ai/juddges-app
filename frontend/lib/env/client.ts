/**
 * Centralized client-side environment variable access.
 *
 * Reads from window.__env, which the root layout fills in two steps before
 * any React code runs: an inline baseline, then /runtime-env.js with the
 * running server's values (see lib/env/server.ts). Falls back to process.env
 * for the non-browser code paths.
 */

declare global {
  interface Window {
    __env?: Record<string, string>;
  }
}

function getEnvVar(name: string): string {
  if (typeof window !== "undefined" && window.__env?.[name]) {
    return window.__env[name];
  }
  return process.env[name] ?? "";
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};
