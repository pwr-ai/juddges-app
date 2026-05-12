import { apiLogger } from "./client";
import type { SearchFeedbackContext } from "@/lib/styles/components/search-result-feedback";

export interface SubmitSearchFeedbackInput {
  document_id: string;
  search_query: string;
  rating: "relevant" | "not_relevant" | "somewhat_relevant";
  session_id?: string | null;
  result_position?: number | null;
  reason?: string | null;
  search_context?: SearchFeedbackContext | Record<string, unknown> | null;
}

export interface SubmitSearchFeedbackResponse {
  status: "success" | "failed";
  feedback_id: string | null;
  message: string;
}

/**
 * Submit a relevance rating on a search result via the backend
 * `/api/feedback/search` endpoint. The backend handles spam guards, rate
 * limiting, and attributes the row to the authenticated user via JWT (or
 * stores it anonymously when no session exists).
 */
export async function submitSearchFeedback(
  input: SubmitSearchFeedbackInput,
): Promise<SubmitSearchFeedbackResponse> {
  const response = await fetch("/api/feedback/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json().catch(() => null)) as
    | SubmitSearchFeedbackResponse
    | { detail?: string; error?: string }
    | null;

  if (!response.ok) {
    const message =
      (data as { detail?: string; error?: string } | null)?.detail ??
      (data as { detail?: string; error?: string } | null)?.error ??
      "Failed to submit search feedback";
    apiLogger.error("submitSearchFeedback failed", {
      status: response.status,
      message,
    });
    throw new Error(message);
  }

  return data as SubmitSearchFeedbackResponse;
}
