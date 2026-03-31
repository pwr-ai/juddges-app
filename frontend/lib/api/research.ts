import { apiLogger } from './client';
import type { RecommendationsResponse, TrackInteractionRequest } from "@/types/recommendations";
import type {
  AnalyzeResearchRequest,
  AnalyzeResearchResponse,
  QuickSuggestion,
  SavedResearchContext,
  SaveResearchContextRequest,
} from "@/types/research-assistant";

// Semantic Clustering

export interface SemanticClusteringInput {
  sample_size?: number;
  num_clusters?: number;
  document_types?: string[];
}

export interface ClusterDocument {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  similarity_to_centroid: number;
}

export interface SemanticCluster {
  cluster_id: number;
  size: number;
  keywords: string[];
  coherence_score: number;
  documents: ClusterDocument[];
}

export interface ClusterNode {
  id: string;
  title: string;
  document_type: string;
  year: number | null;
  x: number;
  y: number;
  cluster_id: number;
}

export interface ClusterEdge {
  source: string;
  target: string;
  similarity: number;
}

export interface ClusteringStatistics {
  total_documents: number;
  num_clusters: number;
  avg_cluster_size: number;
  min_cluster_size: number;
  max_cluster_size: number;
  avg_coherence: number;
  clustering_time_ms: number;
}

export interface SemanticClusteringResponse {
  clusters: SemanticCluster[];
  nodes: ClusterNode[];
  edges: ClusterEdge[];
  statistics: ClusteringStatistics;
}

export async function getSemanticClusters(
  input?: SemanticClusteringInput
): Promise<SemanticClusteringResponse> {
  apiLogger.info('getSemanticClusters called', {
    sampleSize: input?.sample_size,
    numClusters: input?.num_clusters,
    documentTypes: input?.document_types,
  });

  const response = await fetch('/api/clustering/semantic-clusters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to generate clusters' }));
    apiLogger.error('Clustering API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to generate semantic clusters. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('getSemanticClusters response', {
    clusterCount: result.clusters?.length,
    nodeCount: result.nodes?.length,
    edgeCount: result.edges?.length,
  });

  return result;
}

// Smart Recommendations

export async function getRecommendations(params?: {
  query?: string;
  document_id?: string;
  limit?: number;
  strategy?: "auto" | "content_based" | "history_based" | "hybrid";
}): Promise<RecommendationsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set("query", params.query);
  if (params?.document_id) searchParams.set("document_id", params.document_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.strategy) searchParams.set("strategy", params.strategy);

  const url = `/api/recommendations?${searchParams.toString()}`;
  apiLogger.info("getRecommendations called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to fetch recommendations" }));
    apiLogger.error("Recommendations API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to fetch recommendations.");
  }

  return response.json();
}

export async function trackDocumentInteraction(
  request: TrackInteractionRequest
): Promise<void> {
  try {
    await fetch("/api/recommendations/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    // Non-critical, silently fail
    apiLogger.warn("Failed to track document interaction", request);
  }
}

// Research Assistant

export async function analyzeResearchContext(
  request: AnalyzeResearchRequest
): Promise<AnalyzeResearchResponse> {
  apiLogger.info("analyzeResearchContext called", request);

  const response = await fetch("/api/research-assistant?action=analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to analyze research context" }));
    apiLogger.error("Research analysis API error: ", response.status, errorData);
    throw new Error(
      errorData.error || "Failed to analyze research context."
    );
  }

  return response.json();
}

export async function getResearchSuggestions(params?: {
  query?: string;
  document_id?: string;
  limit?: number;
}): Promise<QuickSuggestion> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "suggestions");
  if (params?.query) searchParams.set("query", params.query);
  if (params?.document_id)
    searchParams.set("document_id", params.document_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const url = `/api/research-assistant?${searchParams.toString()}`;
  apiLogger.info("getResearchSuggestions called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to fetch suggestions" }));
    apiLogger.error("Suggestions API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to fetch suggestions.");
  }

  return response.json();
}

export async function getResearchContexts(params?: {
  limit?: number;
  status?: string;
}): Promise<SavedResearchContext[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "contexts");
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.status) searchParams.set("status", params.status);

  const url = `/api/research-assistant?${searchParams.toString()}`;
  apiLogger.info("getResearchContexts called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to fetch research contexts" }));
    apiLogger.error("Contexts API error: ", response.status, errorData);
    throw new Error(
      errorData.error || "Failed to fetch research contexts."
    );
  }

  return response.json();
}

export async function saveResearchContext(
  request: SaveResearchContextRequest
): Promise<SavedResearchContext> {
  apiLogger.info("saveResearchContext called", request);

  const response = await fetch("/api/research-assistant?action=save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to save research context" }));
    apiLogger.error(
      "Save context API error: ",
      response.status,
      errorData
    );
    throw new Error(
      errorData.error || "Failed to save research context."
    );
  }

  return response.json();
}
