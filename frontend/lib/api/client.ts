import { DocumentType } from "@/types/search";
export type { SearchResult } from "@/types/search";
import logger from "@/lib/logger";

export const apiLogger = logger.child('api');

export interface DocumentRetrievalInput {
  question: string;
  document_types?: DocumentType[] | null;
  languages?: string[] | null;
  max_documents?: number | null;
  score_threshold?: number | null;
  chat_history?: { content: string, role: "ai" | "human" }[] | null;
  response_format?: "short" | "detailed" | "adaptive" | null;
}

export interface DocumentRetrievalOutput {
  text: string;
  document_ids: string[];
  format_used?: "short" | "detailed" | null;
}

export interface ApiResponse {
  output: DocumentRetrievalOutput;
  metadata: {
    run_id: string;
    feedback_tokens: {
      key: string;
      token_url: string | null;
      expires_at: string | null;
    }[];
  };
}

export interface StreamData {
  type: string;
  data?: {
    text?: string;
    document_ids?: string[];
    source_documents?: unknown[];
  };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface SearchDocumentsInput {
  question: string;
  maxDocuments: number;
  documentTypes?: DocumentType[];
  languages?: string[];
  mode?: "rabbit" | "thinking";
}

export interface DocumentInput {
  document_id: string;
  document_type: string;
  title?: string | null;
  date_issued?: string | null;
  issuing_body?: {
    name: string;
    jurisdiction?: string;
    type: string;
  } | null;
  language?: string | null;
  document_number?: string | null;
  country?: string | null;
  full_text?: string | null;
  summary?: string | null;
  thesis?: string | null;
  legal_references?: Array<{
    ref_type: string;
    text: string;
    normalized_citation?: string;
  }> | null;
  legal_concepts?: Array<{
    concept_name: string;
    concept_type?: string;
  }> | null;
  keywords?: string[] | null;
  // Court-specific fields
  court_name?: string | null;
  department_name?: string | null;
  presiding_judge?: string | null;
  judges?: string[] | null;
  parties?: string | null;
  outcome?: string | null;
  legal_bases?: string[] | null;
  extracted_legal_bases?: string | null;
  references?: string[] | null;
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
  // Additional fields for API responses
  full_text_preview?: string;
  score?: number | null;
}

export interface StreamChatCallbacks {
  onToken: (token: string) => void;
  onMetadata?: (metadata: Record<string, unknown>) => void;
  onComplete: (fullText: string, documentIds?: string[]) => void;
  onError: (error: Error) => void;
}
