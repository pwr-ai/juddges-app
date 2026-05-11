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
