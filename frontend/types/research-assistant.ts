export interface ResearchTopic {
  name: string;
  relevance: number; // 0-1
  document_count: number;
  description: string | null;
}

export interface KnowledgeGap {
  topic: string;
  description: string;
  severity: "low" | "medium" | "high";
  suggested_query: string | null;
}

export interface ResearchStep {
  title: string;
  description: string;
  action_type: "search" | "read_document" | "explore_topic" | "compare_documents";
  query: string | null;
  document_ids: string[] | null;
  priority: number;
}

export interface RelatedDocument {
  document_id: string;
  title: string | null;
  document_type: string | null;
  relevance_score: number;
  reason: string;
}

export interface AnalyzeResearchRequest {
  query?: string;
  document_ids?: string[];
  chat_id?: string;
}

export interface AnalyzeResearchResponse {
  topics: ResearchTopic[];
  gaps: KnowledgeGap[];
  next_steps: ResearchStep[];
  related_documents: RelatedDocument[];
  coverage_score: number;
  analysis_summary: string;
}

export interface QuickSuggestion {
  related_documents: RelatedDocument[];
  next_steps: ResearchStep[];
  trending_topics: string[];
}

export interface SavedResearchContext {
  id: string;
  user_id: string;
  chat_id: string | null;
  title: string | null;
  analyzed_topics: ResearchTopic[];
  identified_gaps: KnowledgeGap[];
  suggested_next_steps: ResearchStep[];
  related_document_ids: string[];
  coverage_score: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SaveResearchContextRequest {
  chat_id?: string;
  title?: string;
  analyzed_topics?: ResearchTopic[];
  identified_gaps?: KnowledgeGap[];
  suggested_next_steps?: ResearchStep[];
  related_document_ids?: string[];
  coverage_score?: number;
}

export interface ResearchContextsListResponse {
  contexts: SavedResearchContext[];
  total: number;
}
