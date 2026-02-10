/**
 * Type definitions for the citation network visualization
 */

export interface CitationNode {
  id: string;
  title: string;
  document_type: string;
  year: number | null;
  x: number;
  y: number;
  citation_count: number;
  authority_score: number;
  references: string[];
  metadata: {
    court_name: string | null;
    document_number: string | null;
    language: string | null;
    date_issued: string | null;
  };
}

export interface CitationEdge {
  source: string;
  target: string;
  shared_refs: string[];
  weight: number;
}

export interface CitationNetworkStatistics {
  total_nodes: number;
  total_edges: number;
  avg_citations: number;
  max_citations: number;
  most_cited_refs: Array<{ reference: string; count: number }>;
  avg_authority_score: number;
}

export interface CitationNetworkData {
  nodes: CitationNode[];
  edges: CitationEdge[];
  statistics: CitationNetworkStatistics;
}

export interface CitationNetworkControls {
  sampleSize: number;
  minSharedRefs: number;
  selectedDocumentTypes: string[];
}
