import { useQuery } from "@tanstack/react-query";

import logger from "@/lib/logger";

const topicsLogger = logger.child("api/topics");

export interface TopicClickPayload {
  topic_id: string;
  query: string;
  jurisdiction: string | null;
}

/**
 * Fire-and-forget POST to record a topic-chip click for analytics.
 * Never throws; errors are logged silently.
 */
export function postTopicClick(payload: TopicClickPayload): void {
  fetch("/api/search/topic-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error: unknown) => {
    topicsLogger.warn("topic-click analytics failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

// ── Topic analytics surface (issue #229) ─────────────────────────────────

/** Corpus snapshot metadata for the Meilisearch topics index. */
export interface TopicsMeta {
  total_concepts: number;
  generated_at: string | null;
  corpus_snapshot: number | null;
  jurisdictions: string[];
}

/** A trending topic with its cross-lingual (PL/UK) click split. */
export interface TrendingTopic {
  topic_id: string;
  click_count: number;
  pl_count: number;
  uk_count: number;
  other_count: number;
  last_clicked: string | null;
}

/** A topic the current user has recently explored. */
export interface UserTopicClick {
  topic_id: string;
  click_count: number;
  last_clicked: string | null;
  last_query: string | null;
  jurisdiction: string | null;
}

async function fetchJson<T>(url: string, errorLabel: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    topicsLogger.warn(errorLabel, { status: response.status, ...data });
    throw new Error(data.error || data.detail || errorLabel);
  }
  return response.json() as Promise<T>;
}

/** Fetch corpus-snapshot metadata. */
export function getTopicsMeta(): Promise<TopicsMeta> {
  return fetchJson<TopicsMeta>(
    "/api/search/topics/meta",
    "Failed to fetch topics meta",
  );
}

/** Fetch the most-clicked topics over the last `days` days. */
export function getTrendingTopics(
  days = 30,
  limit = 20,
): Promise<TrendingTopic[]> {
  const params = new URLSearchParams({
    days: String(days),
    limit: String(limit),
  });
  return fetchJson<TrendingTopic[]>(
    `/api/search/topics/trending?${params}`,
    "Failed to fetch trending topics",
  );
}

/** Fetch the authenticated user's recently-explored topics. */
export function getMyTopicClicks(
  days = 30,
  limit = 50,
): Promise<UserTopicClick[]> {
  const params = new URLSearchParams({
    days: String(days),
    limit: String(limit),
  });
  return fetchJson<UserTopicClick[]>(
    `/api/search/topics/my-clicks?${params}`,
    "Failed to fetch your topics",
  );
}

/** Corpus snapshot metadata — cached for 1 hour (snapshot refreshes slowly). */
export function useTopicsMeta(): ReturnType<typeof useQuery<TopicsMeta>> {
  return useQuery({
    queryKey: ["topics", "meta"],
    queryFn: getTopicsMeta,
    staleTime: 60 * 60 * 1000,
  });
}

/** Trending topics — cached for 5 minutes. */
export function useTrendingTopics(
  days = 30,
  limit = 20,
): ReturnType<typeof useQuery<TrendingTopic[]>> {
  return useQuery({
    queryKey: ["topics", "trending", days, limit],
    queryFn: () => getTrendingTopics(days, limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The current user's recent topic clicks. Only enabled when authenticated —
 * the endpoint requires a JWT and returns 401 otherwise.
 */
export function useMyTopicClicks(
  enabled: boolean,
  days = 30,
  limit = 50,
): ReturnType<typeof useQuery<UserTopicClick[]>> {
  return useQuery({
    queryKey: ["topics", "my-clicks", days, limit],
    queryFn: () => getMyTopicClicks(days, limit),
    staleTime: 60 * 1000,
    enabled,
  });
}
