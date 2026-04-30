export interface AnalyzeResearchRequest {
  query?: string;
  document_ids?: string[];
  context?: string;
}

export interface AnalyzeResearchResponse {
  analysis: string;
  themes: string[];
  suggestions: string[];
}

export interface QuickSuggestion {
  suggestions: Array<{
    text: string;
    type: string;
    relevance?: number;
  }>;
}

export interface SavedResearchContext {
  id: string;
  name: string;
  query?: string;
  document_ids: string[];
  notes?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SaveResearchContextRequest {
  name: string;
  query?: string;
  document_ids?: string[];
  notes?: string;
  status?: string;
}
