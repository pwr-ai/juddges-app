export interface DocumentMetadata {
  document_id: string;
  title?: string | null;
  document_type: string;
  date_issued?: string | null;
  document_number?: string | null;
  language: string;
  country?: string;
  summary?: string | null;
  keywords?: string[] | null;
  legal_references?: unknown[] | null;
  legal_concepts?: unknown[] | null;
  court_name?: string | null;
  department_name?: string | null;
  presiding_judge?: string | null;
  judges?: string[] | null;
  parties?: string | null;
  outcome?: string | null;
  legal_bases?: string[] | null;
  extracted_legal_bases?: string | null;
  publication_date?: string | null;
  thesis?: string | null;
  processing_status?: string | null;
  interpretation_status?: string | null;
  source_url?: string | null;
  ingestion_date?: string | null;
  last_updated?: string | null;
  references?: string[] | null;
  issuing_body?: unknown | null;
  x?: number | null;
  y?: number | null;
  [key: string]: unknown; // Allow additional metadata fields
}

export interface SimilarDocument {
  document_id: string;
  db_id: string;
  similarity_score: number;
  title?: string | null;
  document_type?: string | null;
  date_issued?: string | null;
  publication_date?: string | null;
  document_number?: string | null;
  country?: string | null;
  language?: string | null;
  court_name?: string | null;
  department_name?: string | null;
  presiding_judge?: string | null;
  judges?: string[] | null;
  parties?: string | null;
  outcome?: string | null;
  issuing_body?: { name?: string } | null;
}
