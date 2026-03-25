/**
 * API client functions for health check and status endpoints
 *
 * Note: Most endpoints use Next.js API routes as proxies to avoid
 * exposing the backend API key in the browser. The API routes handle
 * authentication server-side.
 */

import { BasicHealthResponse, DetailedStatusResponse, DependenciesResponse } from '@/types/health';

// For basic health check, we can call backend directly (public endpoint)
const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:8004';

/**
 * Fetch basic health check status (public endpoint, no auth required)
 */
export async function getBasicHealth(): Promise<BasicHealthResponse> {
  const response = await fetch(`${BACKEND_URL}/health`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }

  return response.json();
}

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
