/**
 * Server-side access to the public runtime configuration.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` member expressions at build
 * time, so a static reference freezes whatever the build machine had in its
 * environment. Statically prerendered pages then ship that frozen value in
 * their HTML, and the Docker image cannot be reconfigured without a rebuild.
 *
 * A computed lookup (`process.env[name]`) is never inlined, so every reader
 * here goes through `readEnv` and sees the real environment of the running
 * process. Keep all server-side consumers of NEXT_PUBLIC_* on this module;
 * never reference `process.env.NEXT_PUBLIC_SUPABASE_URL` directly.
 */

export const PUBLIC_RUNTIME_ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export type PublicRuntimeEnvKey = (typeof PUBLIC_RUNTIME_ENV_KEYS)[number];

/**
 * Non-prefixed aliases that the backend/compose stack already sets. Used as
 * fallbacks so a container configured only with SUPABASE_URL still works.
 */
const FALLBACK_KEYS: Partial<Record<PublicRuntimeEnvKey, readonly string[]>> = {
  NEXT_PUBLIC_SUPABASE_URL: ["SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["SUPABASE_ANON_KEY"],
  NEXT_PUBLIC_API_BASE_URL: ["BACKEND_URL"],
};

/** Computed lookup on purpose: a static `process.env.X` would be inlined. */
export function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function readPublicEnv(key: PublicRuntimeEnvKey): string {
  const direct = readEnv(key);
  if (direct) return direct;
  for (const fallback of FALLBACK_KEYS[key] ?? []) {
    const value = readEnv(fallback);
    if (value) return value;
  }
  return "";
}

export function getPublicRuntimeEnv(): Record<PublicRuntimeEnvKey, string> {
  return {
    NEXT_PUBLIC_API_BASE_URL: readPublicEnv("NEXT_PUBLIC_API_BASE_URL"),
    NEXT_PUBLIC_SUPABASE_URL: readPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase public configuration is missing: ${missing.join(", ")}. ` +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the runtime environment."
    );
    this.name = "SupabaseConfigError";
  }
}

/**
 * Supabase URL + anon key as seen by the running server. Throws a clear error
 * instead of letting `@supabase/ssr` fail with its generic message.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = readPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const missing = [
    ...(url ? [] : ["NEXT_PUBLIC_SUPABASE_URL"]),
    ...(anonKey ? [] : ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  ];
  if (missing.length > 0) {
    throw new SupabaseConfigError(missing);
  }
  return { url, anonKey };
}

/**
 * Serialize a config object for embedding inside a `<script>` body or a JS
 * response. Escapes the characters that could terminate the script context.
 */
export function serializeForInlineScript(value: Record<string, string>): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Body of `/runtime-env.js`: merges the runtime values into `window.__env`
 * without clobbering keys the inline layout script already set (brand, or the
 * build-time baseline). Empty values are omitted on purpose: an unset
 * variable must never overwrite a baseline value with "".
 */
export function buildRuntimeEnvScript(
  values: Record<string, string> = getPublicRuntimeEnv()
): string {
  const defined = Object.fromEntries(
    Object.entries(values).filter(([, v]) => typeof v === "string" && v !== "")
  );
  return (
    "(function(){" +
    `var config=${serializeForInlineScript(defined)};` +
    "window.__env=Object.assign({},window.__env||{},config);" +
    "})();\n"
  );
}

/** Keys of the public runtime env that are unset in this process. */
export function missingPublicRuntimeEnv(): PublicRuntimeEnvKey[] {
  const values = getPublicRuntimeEnv();
  return PUBLIC_RUNTIME_ENV_KEYS.filter((k) => values[k] === "");
}
