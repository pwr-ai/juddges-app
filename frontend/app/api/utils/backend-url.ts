/**
 * Get the appropriate backend URL based on context
 * - Server-side (API routes): Use API_BASE_URL (Docker internal network)
 * - Client-side: Use NEXT_PUBLIC_API_BASE_URL (public URL)
 */
export function getBackendUrl(): string {
  // For server-side API routes in Docker, use internal network address
  // API_BASE_URL is configured in docker-compose for internal container communication
  // Falls back to NEXT_PUBLIC_API_BASE_URL for development or client-side usage
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8004';
}
