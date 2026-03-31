/**
 * Jest mock for @/lib/env/client
 *
 * Provides stub values for the env object used by lib/supabase/client.ts
 * during unit tests so tests can run without real Supabase credentials.
 */
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
}
