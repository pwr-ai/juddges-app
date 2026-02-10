export interface RecommendationItem {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  document_number: string | null;
  court_name: string | null;
  language: string | null;
  summary: string | null;
  score: number;
  reason: string;
}

export interface RecommendationsResponse {
  recommendations: RecommendationItem[];
  strategy: "content_based" | "history_based" | "hybrid";
  total_found: number;
}

export interface TrackInteractionRequest {
  document_id: string;
  interaction_type:
    | "view"
    | "search_click"
    | "bookmark"
    | "chat_reference"
    | "feedback_positive"
    | "feedback_negative";
  context?: Record<string, unknown>;
}
