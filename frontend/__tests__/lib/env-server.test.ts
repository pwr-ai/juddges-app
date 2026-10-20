/**
 * @jest-environment node
 */
import {
  buildRuntimeEnvScript,
  getPublicRuntimeEnv,
  getSupabasePublicConfig,
  readPublicEnv,
  serializeForInlineScript,
  SupabaseConfigError,
} from "@/lib/env/server";

const KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "BACKEND_URL",
];

describe("lib/env/server", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reads the live process environment, not a build-time snapshot", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://one.supabase.co";
    expect(readPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toBe("https://one.supabase.co");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://two.supabase.co";
    expect(readPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toBe("https://two.supabase.co");
  });

  it("falls back to the non-prefixed aliases the compose stack sets", () => {
    process.env.SUPABASE_URL = "https://alias.supabase.co";
    process.env.SUPABASE_ANON_KEY = "alias-key";
    process.env.BACKEND_URL = "https://api.example.test";
    expect(getPublicRuntimeEnv()).toEqual({
      NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
      NEXT_PUBLIC_SUPABASE_URL: "https://alias.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "alias-key",
    });
  });

  it("trims whitespace and treats blank values as unset", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "   ";
    process.env.SUPABASE_URL = " https://padded.supabase.co ";
    expect(readPublicEnv("NEXT_PUBLIC_SUPABASE_URL")).toBe("https://padded.supabase.co");
  });

  it("getSupabasePublicConfig names every missing variable", () => {
    expect(() => getSupabasePublicConfig()).toThrow(SupabaseConfigError);
    expect(() => getSupabasePublicConfig()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY/
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    expect(() => getSupabasePublicConfig()).toThrow(
      /missing: NEXT_PUBLIC_SUPABASE_ANON_KEY\./
    );
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "k";
    expect(getSupabasePublicConfig()).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
  });

  it("serializeForInlineScript cannot break out of a script context", () => {
    const out = serializeForInlineScript({ a: "</script><script>alert(1)</script>&' " });
    expect(out).not.toMatch(/[<>&']/);
    expect(out).not.toContain(" ");
    expect(JSON.parse(out)).toEqual({ a: "</script><script>alert(1)</script>&' " });
  });

  it("buildRuntimeEnvScript merges into window.__env without clobbering existing keys", () => {
    const script = buildRuntimeEnvScript({
      NEXT_PUBLIC_SUPABASE_URL: "https://rt.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "rt-key",
    });
    const sandbox: { __env?: Record<string, string> } = { __env: { NEXT_PUBLIC_BRAND: "juddges", NEXT_PUBLIC_SUPABASE_URL: "https://baked.supabase.co" } };
    new Function("window", script)(sandbox);
    expect(sandbox.__env).toEqual({
      NEXT_PUBLIC_BRAND: "juddges",
      NEXT_PUBLIC_SUPABASE_URL: "https://rt.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "rt-key",
    });
  });
});
