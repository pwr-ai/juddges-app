import { useQuery, type UseQueryResult } from "@tanstack/react-query";

/**
 * Client bindings for the backend topic-modeling API.
 *
 * Surfaces NMF-based topic extraction over the judgments corpus, including
 * per-topic keywords, temporal trend series, and representative judgments.
 * The backend route is rate limited to 10/hour, so results are cached for
 * 30 minutes via React Query.
 */

export type TopicTrend = "emerging" | "stable" | "declining";

export interface TopicKeyword {
  word: string;
  weight: number;
}

export interface TopicDocument {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  relevance: number;
}

export interface TopicTimePeriod {
  period_label: string;
  start_date: string | null;
  end_date: string | null;
  document_count: number;
  topic_weight: number;
}

export interface Topic {
  topic_id: number;
  label: string;
  keywords: TopicKeyword[];
  document_count: number;
  coherence_score: number;
  trend: TopicTrend;
  trend_slope: number;
  time_series: TopicTimePeriod[];
  top_documents: TopicDocument[];
}

export interface TopicModelingStatistics {
  total_documents: number;
  documents_with_dates: number;
  num_topics: number;
  num_time_periods: number;
  date_range_start: string | null;
  date_range_end: string | null;
  avg_topic_coherence: number;
  processing_time_ms: number;
}

export interface TopicModelingResponse {
  topics: Topic[];
  statistics: TopicModelingStatistics;
}

export interface TopicModelingRequest {
  sample_size?: number;
  num_topics?: number;
  num_keywords?: number;
  time_periods?: number;
  document_types?: string[];
}

export const DEFAULT_TOPIC_MODELING_REQUEST: Required<
  Omit<TopicModelingRequest, "document_types">
> = {
  sample_size: 300,
  num_topics: 8,
  num_keywords: 8,
  time_periods: 6,
};

/** Stable React Query key for a given request shape. */
export function topicModelingQueryKey(
  request: TopicModelingRequest,
): (string | TopicModelingRequest)[] {
  return ["topic-modeling", "analyze", request];
}

/**
 * Fetch topic-modeling results through the Next.js proxy route.
 *
 * Throws an `Error` carrying the backend's `detail` message when the request
 * fails so callers can render the rate-limit / insufficient-corpus errors.
 */
export async function fetchTopicModeling(
  request: TopicModelingRequest,
): Promise<TopicModelingResponse> {
  const response = await fetch("/api/topic-modeling/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = "Failed to analyze topics";
    try {
      const data: unknown = await response.json();
      if (
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
      ) {
        message = (data as { error: string }).error;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<TopicModelingResponse>;
}

/**
 * React Query hook for topic-modeling analysis.
 *
 * Disabled by default so the expensive backend call only fires when the user
 * explicitly requests an analysis (pass `enabled: true`). Cached for 30 minutes
 * to respect the 10/hour backend rate limit.
 */
export function useTopicModeling(
  request: TopicModelingRequest = DEFAULT_TOPIC_MODELING_REQUEST,
  options?: { enabled?: boolean },
): UseQueryResult<TopicModelingResponse, Error> {
  return useQuery<TopicModelingResponse, Error>({
    queryKey: topicModelingQueryKey(request),
    queryFn: () => fetchTopicModeling(request),
    enabled: options?.enabled ?? false,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: false, // rate-limited endpoint — do not hammer on failure
    refetchOnWindowFocus: false,
  });
}

/** Human-readable copy for each trend direction. */
export const TREND_META: Record<
  TopicTrend,
  { label: string; description: string }
> = {
  emerging: {
    label: "Emerging",
    description: "Rising prevalence across recent periods",
  },
  stable: {
    label: "Stable",
    description: "Roughly constant prevalence over time",
  },
  declining: {
    label: "Declining",
    description: "Falling prevalence across recent periods",
  },
};
