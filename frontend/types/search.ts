export interface SearchChunk {
  document_id: string;
  chunk_id: string | number;
  chunk_text?: string;
  segment_type?: string;
  position?: number;
  source?: string;
  confidence_score?: number;
  cited_references?: string;
  tags?: string | string[];
  parent_segment_id?: string;
  score?: number;
  // Additional fields that may come from backend DocumentChunk
  language?: string;
  [key: string]: unknown;
}

export enum DocumentProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIALLY_COMPLETED = 'partially_completed'
}

// Frontend-friendly SearchDocument interface (for UI components)
export interface SearchDocument {
  document_id: string;
  title?: string | null;
  date_issued: string | null;
  issuing_body: {
    name: string;
    jurisdiction?: string;
    type: string;
  } | null;
  language: string | null;
  document_number: string | null;
  country: string | null;
  full_text: string | null;
  summary: string | null;
  thesis: string | null;
  legal_references: Array<{
    ref_type: string;
    text: string;
    normalized_citation?: string;
  }> | null;
  legal_concepts: Array<{
    concept_name: string;
    concept_type?: string;
  }> | null;
  keywords: string[] | null;
  score: number | null;
  // Court-specific fields
  court_name: string | null;
  department_name: string | null;
  presiding_judge: string | null;
  judges: string[] | null;
  parties: string | null;
  outcome: string | null;
  legal_bases: string[] | null;
  extracted_legal_bases: string | null;
  references: string[] | null;
  // Case analysis fields
  factual_state: string | null;
  legal_state: string | null;
  // Metadata
  metadata?: {
    source_url?: string;
    ingestion_date?: string;
    last_updated?: string;
    processing_status?: string;
    publication_date?: string;
    raw_content?: string;
    source?: string;
    x?: number;
    y?: number;
  };
  /**
   * Extracted base-schema columns (base_appellant, base_appeal_outcome,
   * base_num_victims, …). Populated by the backend only when
   * include_base_fields=true is requested on /documents/{id} or
   * /documents/batch. Otherwise undefined.
   */
  base_fields?: Record<string, unknown> | null;
  /**
   * Structural-segmentation (structure_*_summary, structure_confidence, …) and
   * deep-analysis (deep_complexity_score, deep_legal_domains,
   * deep_precedential_value, …) typed extraction columns. Raw JSONB blobs are
   * excluded. Populated by the backend only when include_base_fields=true is
   * requested on /documents/{id} or /documents/batch. Otherwise undefined.
   */
  extraction_fields?: Record<string, unknown> | null;
  // Error flag set by the frontend when a document's source row could not be
  // loaded from the database (rendered as a warning in SourceCard).
  _isDatabaseError?: boolean;
  // Highlighted HTML (with <mark>) from server-side search; rendered via QueryHighlight.
  highlighted?: {
    title?: string | null;
    summary?: string | null;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface SearchResult {
  question: string;
  chunks: SearchChunk[];
  documents: SearchDocument[];
}

// New types for optimized search with metadata
export interface LegalDocumentMetadata {
  uuid: string;
  document_id: string;
  language: string;
  keywords: string[];
  date_issued: string | null;
  score: number | null;
  // Extended fields for DocumentCard
  title?: string | null;
  summary?: string | null;
  court_name?: string | null;
  document_number?: string | null;
  thesis?: string | null;
  // Advanced filtering fields
  jurisdiction?: string | null;
  court_level?: string | null;
  legal_domain?: string | null;
  custom_metadata?: Record<string, string | string[] | number | boolean | null> | null;
  // Highlighted HTML (with <mark>) from server-side search; rendered via QueryHighlight.
  highlighted?: {
    title?: string | null;
    summary?: string | null;
  } | null;
}

export interface SearchDocumentsDirectResponse {
  documents: LegalDocumentMetadata[];
  total_count: number;
  is_capped: boolean;
}

export interface ChunksByDocumentIdsResponse {
  chunks: SearchChunk[];
  query: string;
}

export interface DocumentExtractionResult {
  collection_id: string;
  document_id: string;
  status: DocumentProcessingStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data: Record<string, any>; // This will store the extracted information as a JSON blob
}
