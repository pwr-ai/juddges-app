/**
 * Shared in-memory cache for chat list data.
 * Used by multiple API route files (/api/chats, /api/chats/[id]/fork, etc.)
 * to ensure cache invalidation is consistent across all mutation endpoints.
 */

interface CacheEntry {
  data: any[];
  timestamp: number;
}

// In-memory cache for chats (per user)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 1000; // 30 seconds

/** Generate cache key from user ID */
export function getCacheKey(userId: string): string {
  return `chats:${userId}`;
}

/** Get cached chats if available and not expired */
export function getCachedChats(key: string): any[] | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  // Remove expired entry
  if (cached) {
    cache.delete(key);
  }
  return null;
}

/** Store chats in cache */
export function setCachedChats(key: string, data: any[]): void {
  cache.set(key, { data, timestamp: Date.now() });

  // Clean up old cache entries (keep cache size reasonable)
  if (cache.size > 1000) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
}

/** Invalidate cache for a user */
export function invalidateChatsCache(userId: string): void {
  const key = getCacheKey(userId);
  cache.delete(key);
}

/** Generate ETag from data */
export function generateETag(data: any[]): string {
  const content = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(36)}"`;
}
