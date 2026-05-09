/**
 * Hook for transforming document and similarity data into graph format
 */

import { useMemo } from 'react';
import {
  GraphData,
  GraphNode,
  GraphLink,
  SimilarityFilters,
  DocumentSimilarity,
  GRAPH_COLORS,
} from '@/components/similarity-viz/types';

interface Document {
  document_id: string;
  title: string | null;
  document_type: string;
  full_text: string;
  summary?: string | null;
  created_at: string | null | undefined;
  language?: string;
  keywords?: string[];
  legal_concepts?: Array<{ concept_name: string }>;
  issuing_body?: { name: string };
  x?: number | null;
  y?: number | null;
}

/**
 * Calculate node importance based on number of connections
 */
const calculateImportance = (
  docId: string,
  similarities: DocumentSimilarity[]
): number => {
  const connections = similarities.filter(
    (sim) => sim.document_id_1 === docId || sim.document_id_2 === docId
  );

  // Normalize between 0-1, with max importance at 10+ connections
  return Math.min(connections.length / 10, 1);
};

/**
 * Calculate cluster size and average similarity for a node
 */
const calculateClusterMetrics = (
  nodeId: string,
  links: GraphLink[]
): { clusterSize: number; avgSimilarity: number } => {
  const connectedLinks = links.filter(
    (link) =>
      (typeof link.source === 'string'
        ? link.source
        : link.source.id) === nodeId ||
      (typeof link.target === 'string'
        ? link.target
        : link.target.id) === nodeId
  );

  const clusterSize = connectedLinks.length;
  const avgSimilarity =
    clusterSize > 0
      ? connectedLinks.reduce((sum, link) => sum + link.similarity, 0) /
        clusterSize
      : 0;

  return { clusterSize, avgSimilarity };
};

/**
 * Find shared concepts between two documents
 */
const findSharedConcepts = (
  doc1: Document | undefined,
  doc2: Document | undefined
): string[] => {
  if (!doc1?.legal_concepts || !doc2?.legal_concepts) {
    return [];
  }

  const concepts1 = new Set(
    doc1.legal_concepts.map((c) => c.concept_name.toLowerCase())
  );
  const concepts2 = doc2.legal_concepts.map((c) => c.concept_name);

  return concepts2.filter((c) => concepts1.has(c.toLowerCase()));
};

/**
 * Check if a document matches the current filters
 */
const matchesFilters = (doc: Document, filters: SimilarityFilters): boolean => {
  // Language filter
  if (
    filters.languages.length > 0 &&
    doc.language &&
    !filters.languages.includes(doc.language)
  ) {
    return false;
  }

  // Date range filter — skip if created_at is missing or invalid
  if (filters.dateRange && doc.created_at) {
    const docDate = new Date(doc.created_at);
    if (
      !isNaN(docDate.getTime()) &&
      (docDate < filters.dateRange.start || docDate > filters.dateRange.end)
    ) {
      return false;
    }
  }

  // Keyword filter
  if (filters.keywords.length > 0) {
    const docKeywords = new Set(
      (doc.keywords || []).map((k) => k.toLowerCase())
    );
    const hasMatchingKeyword = filters.keywords.some((k) =>
      docKeywords.has(k.toLowerCase())
    );
    if (!hasMatchingKeyword) {
      return false;
    }
  }

  // Legal concept filter
  if (filters.legalConcepts.length > 0) {
    const docConcepts = new Set(
      (doc.legal_concepts || []).map((c) => c.concept_name.toLowerCase())
    );
    const hasMatchingConcept = filters.legalConcepts.some((c) =>
      docConcepts.has(c.toLowerCase())
    );
    if (!hasMatchingConcept) {
      return false;
    }
  }

  return true;
};

/**
 * Main hook for transforming data into graph format
 */
export const useGraphData = (
  documents: Document[],
  similarities: DocumentSimilarity[],
  filters: SimilarityFilters
): GraphData => {
  return useMemo(() => {
    // Filter documents based on current filters
    const filteredDocs = documents.filter((doc) =>
      matchesFilters(doc, filters)
    );

    if (filteredDocs.length === 0) {
      return { nodes: [], links: [] };
    }

    // Create a set of filtered document IDs for quick lookup
    const filteredDocIds = new Set(filteredDocs.map((d) => d.document_id));

    // Transform documents to graph nodes
    const nodes: GraphNode[] = filteredDocs.map((doc) => ({
      id: doc.document_id,
      title: doc.title || 'Untitled Document',
      documentType: doc.document_type,
      documentId: doc.document_id,
      fullText: doc.full_text,
      summary: doc.summary || undefined,
      date: doc.created_at && !isNaN(new Date(doc.created_at).getTime())
        ? new Date(doc.created_at)
        : null,
      language: doc.language || 'unknown',
      keywords: doc.keywords || [],
      legalConcepts: doc.legal_concepts,
      issuingBody: doc.issuing_body,
      importance: calculateImportance(doc.document_id, similarities),
      clusterSize: 0, // Will be calculated after links
      avgSimilarity: 0, // Will be calculated after links
      x: doc.x || undefined,
      y: doc.y || undefined,
    }));

    // Build links from similarities
    // Filter by similarity threshold and ensure both docs are in filtered set
    const similarityThreshold = filters.similarityThreshold / 100;

    const links: GraphLink[] = similarities
      .filter(
        (sim) =>
          sim.similarity >= similarityThreshold &&
          filteredDocIds.has(sim.document_id_1) &&
          filteredDocIds.has(sim.document_id_2)
      )
      .map((sim) => {
        const doc1 = filteredDocs.find(
          (d) => d.document_id === sim.document_id_1
        );
        const doc2 = filteredDocs.find(
          (d) => d.document_id === sim.document_id_2
        );

        return {
          source: sim.document_id_1,
          target: sim.document_id_2,
          similarity: sim.similarity,
          sharedConcepts: findSharedConcepts(doc1, doc2),
        };
      });

    // Calculate cluster metrics for each node
    const nodesWithMetrics = nodes.map((node) => {
      const metrics = calculateClusterMetrics(node.id, links);
      return {
        ...node,
        ...metrics,
      };
    });

    // Filter out isolated nodes (no connections) if threshold is high
    const connectedNodeIds = new Set<string>();
    links.forEach((link) => {
      connectedNodeIds.add(
        typeof link.source === 'string' ? link.source : link.source.id
      );
      connectedNodeIds.add(
        typeof link.target === 'string' ? link.target : link.target.id
      );
    });

    const finalNodes = nodesWithMetrics.filter(
      (node) =>
        connectedNodeIds.has(node.id) || filters.similarityThreshold < 10
    );

    return {
      nodes: finalNodes,
      links,
    };
  }, [documents, similarities, filters]);
};

/**
 * Get node color based on document type
 */
export const getNodeColor = (node: GraphNode): string => {
  // The graph today only renders judgments, but keep the lookup defensive in
  // case other document types ever flow through.
  const key = node.documentType as keyof typeof GRAPH_COLORS;
  return GRAPH_COLORS[key] ?? GRAPH_COLORS.default;
};

/**
 * Calculate edge width based on similarity strength
 */
export const getEdgeWidth = (similarity: number): number => {
  return 0.5 + similarity * 3; // 0.5px to 3.5px
};

/**
 * Calculate edge opacity based on similarity strength
 */
export const getEdgeOpacity = (similarity: number): number => {
  return 0.15 + similarity * 0.45; // 15% to 60%
};

/**
 * Get edge color (can be customized based on type or similarity)
 */
export const getEdgeColor = (
  link: GraphLink,
  isHighlighted: boolean = false
): string => {
  if (isHighlighted) {
    return `oklch(0.64 0.21 25.33 / ${getEdgeOpacity(link.similarity) + 0.3})`;
  }
  return `oklch(0.55 0.02 264.36 / ${getEdgeOpacity(link.similarity)})`;
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | null): string => {
  if (!date) return 'Unknown date';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};
