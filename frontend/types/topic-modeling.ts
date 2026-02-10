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

export interface TimePeriod {
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
  trend: "emerging" | "stable" | "declining";
  trend_slope: number;
  time_series: TimePeriod[];
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
