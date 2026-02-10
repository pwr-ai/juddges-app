/**
 * TypeScript types for GraphQL API responses.
 *
 * These types mirror the Strawberry GraphQL schema defined in the backend
 * and provide strong typing for frontend GraphQL queries.
 */

// ===== Document Types =====

export interface GQLLegalDocument {
  documentId: string;
  documentType: string;
  title?: string | null;
  dateIssued?: string | null;
  issuingBody?: GQLIssuingBody | null;
  language?: string | null;
  victimsCount?: number | null;
  offendersCount?: number | null;
  caseType: string;
  documentNumber?: string | null;
  country?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  thesis?: string | null;
  courtName?: string | null;
  departmentName?: string | null;
  presidingJudge?: string | null;
  judges?: string[] | null;
  legalBases?: string[] | null;
  parties?: string | null;
  outcome?: string | null;
  sourceUrl?: string | null;
  publicationDate?: string | null;
  ingestionDate?: string | null;
}

export interface GQLIssuingBody {
  name?: string | null;
  jurisdiction?: string | null;
  type?: string | null;
}

export interface GQLLegalDocumentMetadata {
  uuid: string;
  documentId: string;
  documentType: string;
  language?: string | null;
  victimsCount?: number | null;
  offendersCount?: number | null;
  caseType: string;
  keywords?: string[] | null;
  dateIssued?: string | null;
  score?: number | null;
  title?: string | null;
  summary?: string | null;
  courtName?: string | null;
  documentNumber?: string | null;
  thesis?: string | null;
}

export interface GQLDocumentChunk {
  documentId: string;
  documentType?: string | null;
  language?: string | null;
  chunkId: number;
  chunkText: string;
  segmentType?: string | null;
  position?: number | null;
  confidenceScore?: number | null;
  citedReferences?: string[] | null;
  tags?: string[] | null;
}

// ===== Search Types =====

export interface GQLPaginationMetadata {
  offset: number;
  limit: number;
  loadedCount: number;
  estimatedTotal?: number | null;
  hasMore: boolean;
  nextOffset?: number | null;
}

export interface GQLSearchDocumentsResult {
  documents: GQLLegalDocumentMetadata[];
  totalCount: number;
  isCapped: boolean;
  queryTimeMs?: number | null;
}

export interface GQLSearchChunksResult {
  chunks: GQLDocumentChunk[];
  documents?: GQLLegalDocument[] | null;
  totalChunks: number;
  uniqueDocuments: number;
  queryTimeMs?: number | null;
  pagination?: GQLPaginationMetadata | null;
}

export interface GQLSimilarDocumentResult {
  documentId: string;
  dbId: string;
  similarityScore: number;
  title?: string | null;
  documentType?: string | null;
  dateIssued?: string | null;
  documentNumber?: string | null;
  country?: string | null;
  language?: string | null;
}

export interface GQLSimilarDocumentsResult {
  queryDocumentId: string;
  similarDocuments: GQLSimilarDocumentResult[];
  totalFound: number;
}

// ===== Extraction Types =====

export interface GQLExtractionJob {
  jobId: string;
  collectionId?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  totalDocuments?: number | null;
  completedDocuments?: number | null;
  elapsedTimeSeconds?: number | null;
  estimatedTimeRemainingSeconds?: number | null;
}

// ===== Subscription Types =====

export interface GQLExtractionProgressEvent {
  jobId: string;
  status: string;
  completedDocuments: number;
  totalDocuments: number;
  progressPercent: number;
  currentDocumentId?: string | null;
  errorMessage?: string | null;
}

export interface GQLDocumentIndexedEvent {
  documentId: string;
  documentType: string;
  title?: string | null;
  indexedAt: string;
}

// ===== Query Response Types =====

export interface GQLSearchDocumentsResponse {
  searchDocuments: GQLSearchDocumentsResult;
}

export interface GQLSearchChunksResponse {
  searchChunks: GQLSearchChunksResult;
}

export interface GQLDocumentResponse {
  document: GQLLegalDocument | null;
}

export interface GQLDocumentsResponse {
  documents: GQLLegalDocument[];
}

export interface GQLSimilarDocumentsResponse {
  similarDocuments: GQLSimilarDocumentsResult[];
}

export interface GQLExtractionJobsResponse {
  extractionJobs: GQLExtractionJob[];
}
