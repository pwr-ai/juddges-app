/**
 * Centralized client-side environment variable access.
 *
 * Reads from window.__env (injected at runtime by docker-entrypoint.sh)
 * with fallback to process.env (inlined at build time by Next.js).
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
