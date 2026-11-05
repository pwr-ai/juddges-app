/**
 * API client functions for health check and status endpoints
 *
 * Note: All endpoints use Next.js API routes as proxies to avoid
 * exposing the backend API key in the browser. The API routes handle
 * authentication server-side.
 */

import { DetailedStatusResponse, DependenciesResponse } from '@/types/health';

// Every call goes through this app's own BFF routes (`/api/health/*`) with a
// relative URL. Never call the backend directly from here: this module runs in
// the browser, where a backend URL would be the build machine's value (#578).

/**
 * Fetch detailed status with all service checks
 * Uses Next.js API route proxy for server-side authentication
 */
export async function getDetailedStatus(): Promise<DetailedStatusResponse> {
  const response = await fetch('/api/health/status', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store', // Don't cache in the browser
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Status check failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch dependencies information
 * Uses Next.js API route proxy for server-side authentication
 */
export async function getDependencies(): Promise<DependenciesResponse> {
  const response = await fetch('/api/health/dependencies', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to fetch dependencies: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Invalidate status cache
 * Uses Next.js API route proxy for server-side authentication
 */
export async function invalidateStatusCache(): Promise<void> {
  const response = await fetch('/api/health/invalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Failed to invalidate cache: ${response.statusText}`);
  }
}
