export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  folder: string | null;
  query: string;
  search_config: SavedSearchConfig;
  document_types: string[];
  languages: string[];
  search_mode: 'rabbit' | 'thinking';
  is_shared: boolean;
  shared_with: string[];
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchConfig {
  filters?: {
    keywords?: string[];
    legalConcepts?: string[];
    documentTypes?: string[];
    issuingBodies?: string[];
    languages?: string[];
    dateFrom?: string;
    dateTo?: string;
    jurisdictions?: string[];
    courtLevels?: string[];
    legalDomains?: string[];
    customMetadata?: Record<string, string[]>;
  };
  pageSize?: number;
  ignoreUnknownType?: boolean;
}

export interface CreateSavedSearchInput {
  name: string;
  description?: string;
  folder?: string;
  query: string;
  search_config: SavedSearchConfig;
  document_types?: string[];
  languages?: string[];
  search_mode?: 'rabbit' | 'thinking';
  is_shared?: boolean;
}

export interface UpdateSavedSearchInput {
  name?: string;
  description?: string | null;
  folder?: string | null;
  query?: string;
  search_config?: SavedSearchConfig;
  document_types?: string[];
  languages?: string[];
  search_mode?: 'rabbit' | 'thinking';
  is_shared?: boolean;
}
