export interface SearchQuery {
  id: string; // UUID
  user_id: string;
  query: string;
  created_at: string;
  updated_at: string;
  max_documents?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  // Analytics fields (optional, set by backend)
  result_count?: number;
  filters?: Record<string, unknown>;
  duration_ms?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clicked_result?: Record<string, any>;
  session_id?: string;
}

export interface CreateSearchQuery {
  user_id: string;
  query: string;
  max_documents?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export interface UpdateSearchQuery {
  query?: string;
  max_documents?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
} 