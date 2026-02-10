/**
 * Type definitions for Document Similarity Visualization
 */

import { DocumentType } from '@/types/search';

export interface GraphNode {
  id: string;
  title: string;
  documentType: DocumentType;
  documentId: string;
  fullText: string;
  summary?: string;
  date: Date;
  language: string;
  keywords: string[];
  legalConcepts?: Array<{ concept_name: string }>;
  issuingBody?: { name: string };

  // Graph-specific properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;

  // Visual properties
  importance: number;        // 0-1, affects node size
  clusterSize: number;
  avgSimilarity: number;

  // UI state
  hovered?: boolean;
  selected?: boolean;
  highlighted?: boolean;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  similarity: number;        // 0-1
  sharedConcepts?: string[];

  // UI state
  highlighted?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface SimilarityFilters {
  documentTypes: DocumentType[];
  languages: string[];
  dateRange: {
    start: Date;
    end: Date;
  } | null;
  similarityThreshold: number;  // 0-100
  keywords: string[];
  legalConcepts: string[];
}

export type GraphLayoutType = 'force' | 'circular' | 'hierarchical';

export interface GraphLayout {
  type: GraphLayoutType;
  options: {
    nodeSpacing?: number;
    edgeLength?: number;
    clusterPadding?: number;
    centerForce?: number;
    chargeStrength?: number;
  };
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface DocumentSimilarity {
  document_id_1: string;
  document_id_2: string;
  similarity: number;
  shared_concepts?: string[];
}

export interface SimilarityAPIResponse {
  similarities: DocumentSimilarity[];
  documents: Array<{
    document_id: string;
    title: string | null;
    document_type: DocumentType;
    full_text: string;
    summary?: string | null;
    created_at: string;
    language?: string;
    keywords?: string[];
    legal_concepts?: Array<{ concept_name: string }>;
    issuing_body?: { name: string };
    x?: number | null;
    y?: number | null;
  }>;
}

export interface GraphColors {
  judgment: string;
  tax_interpretation: string;
  regulation: string;
  error: string;
  default: string;
}

export const GRAPH_COLORS: GraphColors = {
  judgment: '#6366f1',           // Indigo
  tax_interpretation: '#10B981', // Emerald
  regulation: '#F59E0B',         // Amber
  error: '#EF4444',              // Red
  default: '#8B5CF6',            // Purple
};

export const DEFAULT_FILTERS: SimilarityFilters = {
  documentTypes: [],
  languages: [],
  dateRange: null,
  similarityThreshold: 50,
  keywords: [],
  legalConcepts: [],
};

export const DEFAULT_LAYOUT: GraphLayout = {
  type: 'force',
  options: {
    nodeSpacing: 100,
    edgeLength: 150,
    centerForce: 0.1,
    chargeStrength: -200,
  },
};

export const DEFAULT_VIEWPORT: ViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
};
