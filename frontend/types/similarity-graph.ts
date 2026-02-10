/**
 * Type definitions for the document similarity graph visualization
 */

export interface GraphNodeMetadata {
  document_number: string;
  date_issued: string | null;
  language: string;
  court_name: string;
}

export interface GraphNode {
  id: string;
  title: string;
  document_type: string;
  year: number | null;
  x: number;
  y: number;
  cluster_id: number | null;
  metadata: GraphNodeMetadata;
}

export interface GraphEdge {
  source: string;
  target: string;
  similarity: number;
}

export interface GraphStatistics {
  total_nodes: number;
  total_edges: number;
  avg_similarity: number;
  min_similarity: number;
  max_similarity: number;
  num_clusters: number | null;
}

export interface SimilarityGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  statistics: GraphStatistics;
}

/**
 * Internal graph node with additional rendering properties
 */
export interface GraphNodeObject extends GraphNode {
  // Additional properties for force-graph rendering
  color?: string;
  size?: number;
  neighbors?: Set<string>;
  links?: GraphEdge[];
}

/**
 * Graph visualization controls
 */
export interface GraphControls {
  sampleSize: number;
  similarityThreshold: number;
  selectedDocumentTypes: string[];
  enableClustering: boolean;
  layoutAlgorithm: 'force-directed' | 'hierarchical' | 'circular';
}

/**
 * Similar document info for side panel
 */
export interface SimilarDocument {
  id: string;
  title: string;
  document_type: string;
  similarity: number;
}
