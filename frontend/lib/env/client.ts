/**
 * Client-side environment variable access
 *
 * This module provides type-safe access to runtime environment variables
 * with a dual-loading strategy:
 *
 * 1. Runtime config (Priority): window.__env (Docker production)
 * 2. Build-time config (Fallback): process.env.NEXT_PUBLIC_* (development/build)
 *
 * Usage:
 *   import { env } from '@/lib/env/client'
 *   console.log(env.NEXT_PUBLIC_SUPABASE_URL)
 */

import type { RuntimeEnv } from './types';
import { logger } from "@/lib/logger";

/**
 * Get environment variable with fallback chain:
 * 1. Runtime config (window.__env) - Docker production deployments
 * 2. Build-time env vars (process.env) - Static builds or development
 *
 * @param key Environment variable key
 * @returns Value of the environment variable or empty string
 */
function getEnvVar<K extends keyof RuntimeEnv>(key: K): string {
  // Server-side: always use process.env
  if (typeof window === 'undefined') {
    return process.env[key] || '';
  }

  // Client-side: try runtime config first
  if (window.__env?.[key]) {
    return window.__env[key];
  }

  // Fall back to build-time env vars
  const buildValue = process.env[key] || '';
  return buildValue;
}

/**
 * Validate that all required environment variables are present
 */
function validateEnv(): RuntimeEnv {
  const requiredVars: Array<keyof RuntimeEnv> = [
    'NEXT_PUBLIC_API_BASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missing: string[] = [];
  const env = {} as RuntimeEnv;

  for (const key of requiredVars) {
    const value = getEnvVar(key);

    // Check for placeholder values
    const placeholders = [
      '',
      'http://localhost:8000',
      'http://placeholder-api',
      'https://example.supabase.co',
      'https://placeholder.supabase.co',
      'dummy-supabase-anon-key',
      'placeholder-anon-key',
      'placeholder-key',
    ];

    if (!value || placeholders.includes(value)) {
      missing.push(key);
    } else {
      env[key] = value;
    }
  }

  // Log configuration status (only on client-side in development)
  if (typeof window !== 'undefined') {
    if (missing.length > 0) {
      const configSource = window.__env ? 'runtime (window.__env)' : 'build-time (process.env)';
      logger.error('[ENV] Missing or invalid environment variables:', missing);
      logger.error('[ENV] Config source:', configSource);
      logger.error('[ENV] window.__env:', window.__env);

      throw new Error(
        `Missing or invalid environment variables: ${missing.join(', ')}\n\n` +
        'Please ensure these variables are set:\n' +
        '1. For Docker: Check .env file and docker-compose.yml build args\n' +
        '2. For Local Dev: Check .env.local file\n' +
        '3. See docs/reference/environment-configuration.md for more information.'
      );
    }
  }

  return env;
}

/**
 * Lazy-loaded environment configuration
 * This ensures window.__env is loaded before validation runs
 */
let _env: RuntimeEnv | null = null;

/**
 * Centralized environment variable access
 * All NEXT_PUBLIC_* variables are validated and typed
 *
 * Uses lazy initialization to ensure window.__env is available
 */
export const env = new Proxy({} as RuntimeEnv, {
  get(target, prop: string) {
    // Initialize on first access (lazy loading)
    if (!_env) {
      _env = validateEnv();
    }
    return _env[prop as keyof RuntimeEnv];
  }
});

/**
 * Check if environment is properly configured (for conditional rendering)
 */
export function isEnvConfigured(): boolean {
  try {
    validateEnv();
    return true;
  } catch {
    return false;
  }
}
