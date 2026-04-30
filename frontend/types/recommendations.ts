export interface RecommendationsResponse {
  recommendations: Array<{
    document_id: string;
    title: string;
    score: number;
    reason?: string;
  }>;
  strategy: string;
}

export interface TrackInteractionRequest {
  document_id: string;
  interaction_type: string;
  query?: string;
  metadata?: Record<string, unknown>;
}
