/**
 * Chat Sources & Citations Type Definitions
 *
 * This file defines TypeScript interfaces for the chat sources/citations feature.
 * These types support displaying legal document references within chat messages.
 *
 * @see /docs/CHAT_SOURCES_CITATIONS_DESIGN.md
 */

import { SearchDocument } from './search';

/**
 * Message sources associated with a specific chat message
 */
export interface MessageSources {
  /** Unique identifier for the message */
  messageId: string;

  /** Array of document IDs that were used to generate this response */
  documentIds: string[];

  /** Lazy-loaded full document details */
  documents?: SearchDocument[];

  /** Timestamp when documents were fetched */
  fetchedAt?: string;
}

/**
 * Cache entry for storing fetched source documents
 */
export interface SourceCacheEntry {
  /** Full document data */
  document: SearchDocument;

  /** When this entry was fetched */
  fetchedAt: string;

  /** When this cache entry expires */
  expiresAt: string;
}

/**
 * Cache storage structure for source documents
 */
export interface SourcesCache {
  [documentId: string]: SourceCacheEntry;
}

/**
 * User action performed on a source card
 */
export interface SourceCardAction {
  /** Type of action performed */
  type: 'view' | 'save' | 'share' | 'copy';

  /** Document ID the action was performed on */
  documentId: string;

  /** Timestamp of the action */
  timestamp: string;

  /** Optional additional metadata */
  metadata?: {
    collectionId?: string;
    shareMethod?: 'email' | 'link' | 'social';
  };
}

/**
 * Document type configuration for icons and styling
 */
export interface DocumentTypeConfig {
  /** Icon component name from lucide-react */
  icon: string;

  /** Human-readable label */
  label: string;

  /** CSS color class for text */
  color: string;

  /** CSS color class for background */
  bgColor: string;

  /** Optional emoji representation */
  emoji?: string;
}

/**
 * Map of document types to their configurations
 */
export const DOCUMENT_TYPE_CONFIGS: Record<string, DocumentTypeConfig> = {
  judgment: {
    icon: 'Scale',
    label: 'Court Judgment',
    color: 'text-judgment',
    bgColor: 'bg-judgment/10',
    emoji: '⚖️',
  },
  regulation: {
    icon: 'BookOpen',
    label: 'Legal Regulation',
    color: 'text-document',
    bgColor: 'bg-document/10',
    emoji: '📖',
  },
  case_law: {
    icon: 'Gavel',
    label: 'Case Law',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    emoji: '🔨',
  },
};

/**
 * Props for the MessageSources component
 */
export interface MessageSourcesProps {
  /** Array of document IDs to display */
  documentIds: string[];

  /** Unique message identifier */
  messageId: string;

  /** Optional CSS class name */
  className?: string;

  /** Whether sources should be expanded by default */
  defaultExpanded?: boolean;

  /** Callback when sources are expanded/collapsed */
  onToggle?: (isExpanded: boolean) => void;

  /** Callback when a source is viewed */
  onViewSource?: (documentId: string) => void;
}

/**
 * Props for the SourceCard component
 */
export interface SourceCardProps {
  /** Document data to display */
  document: SearchDocument;

  /** Index number for citation reference [1], [2], etc. */
  index: number;

  /** Optional CSS class name */
  className?: string;

  /** Callback when "View Document" is clicked */
  onViewDocument?: (documentId: string) => void;

  /** Callback when "Save to Collection" is clicked */
  onAddToCollection?: (documentId: string) => void;

  /** Whether this source is already saved */
  isSaved?: boolean;

  /** Whether to show actions (view, save) */
  showActions?: boolean;

  /** Data attribute for source index (used for scrolling) */
  'data-source-index'?: number;
}

/**
 * Props for the DocumentTypeIcon component
 */
export interface DocumentTypeIconProps {
  /** Document type identifier */
  type: string;

  /** Icon size variant */
  size?: 'sm' | 'md' | 'lg';

  /** Whether to show the label text */
  showLabel?: boolean;

  /** Optional CSS class name */
  className?: string;
}

/**
 * State for the MessageSources component
 */
export interface MessageSourcesState {
  /** Whether the sources section is expanded */
  isExpanded: boolean;

  /** Fetched document data */
  documents: SearchDocument[];

  /** Whether documents are currently loading */
  isLoading: boolean;

  /** Error message if fetch failed */
  error: string | null;

  /** IDs of documents that are currently saved */
  savedDocumentIds: Set<string>;
}

/**
 * Options for the useSourceDocuments hook
 */
export interface UseSourceDocumentsOptions {
  /** Whether to fetch documents immediately */
  enabled?: boolean;

  /** Cache time in milliseconds */
  cacheTime?: number;

  /** Stale time in milliseconds */
  staleTime?: number;

  /** Callback on successful fetch */
  onSuccess?: (documents: SearchDocument[]) => void;

  /** Callback on fetch error */
  onError?: (error: Error) => void;
}

/**
 * Return value from useSourceDocuments hook
 */
export interface UseSourceDocumentsReturn {
  /** Fetched documents */
  documents: SearchDocument[] | undefined;

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: Error | null;

  /** Function to refetch documents */
  refetch: () => void;

  /** Whether the data is stale */
  isStale: boolean;
}

/**
 * Batch fetch request for multiple documents
 */
export interface BatchDocumentFetchRequest {
  /** Array of document IDs to fetch */
  document_ids: string[];

  /** Optional fields to include in response */
  include_fields?: string[];

  /** Whether to include full text content */
  include_full_text?: boolean;
}

/**
 * Batch fetch response
 */
export interface BatchDocumentFetchResponse {
  /** Array of fetched documents */
  documents: SearchDocument[];

  /** IDs of documents that couldn't be found */
  not_found?: string[];

  /** Any errors that occurred during fetch */
  errors?: Array<{
    document_id: string;
    error: string;
  }>;
}

/**
 * Citation reference in message content
 */
export interface CitationReference {
  /** Citation number [1], [2], etc. */
  number: number;

  /** Document ID being referenced */
  documentId: string;

  /** Position in the message text */
  position: {
    start: number;
    end: number;
  };

  /** Text of the citation */
  text: string;
}

/**
 * Parsed citations from message content
 */
export interface ParsedCitations {
  /** Array of citation references found */
  citations: CitationReference[];

  /** Original message text */
  originalText: string;

  /** Whether all citations could be matched to document IDs */
  allMatched: boolean;
}

/**
 * Source preview excerpt
 */
export interface SourceExcerpt {
  /** Document ID */
  documentId: string;

  /** Excerpt text */
  text: string;

  /** Maximum character length */
  maxLength?: number;

  /** Whether text was truncated */
  truncated: boolean;
}

/**
 * Analytics event for source interactions
 */
export interface SourceAnalyticsEvent {
  /** Type of event */
  eventType: 'expand' | 'collapse' | 'view' | 'save' | 'click_citation';

  /** Message ID */
  messageId: string;

  /** Document ID (if applicable) */
  documentId?: string;

  /** Citation number (if applicable) */
  citationNumber?: number;

  /** Timestamp */
  timestamp: string;

  /** User ID */
  userId?: string;

  /** Session ID */
  sessionId?: string;
}
