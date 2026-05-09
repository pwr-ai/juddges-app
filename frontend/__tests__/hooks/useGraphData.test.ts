/**
 * Tests for useGraphData hook and utility functions
 *
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import {
  useGraphData,
  getNodeColor,
  getEdgeWidth,
  getEdgeOpacity,
  getEdgeColor,
  formatDate,
  truncateText,
} from '@/lib/hooks/useGraphData';
import type {
  SimilarityFilters,
  DocumentSimilarity,
  GraphNode,
  GraphLink,
} from '@/components/similarity-viz/types';

// --- Test Data Factories ---

function createDocument(overrides: Partial<any> = {}) {
  return {
    document_id: 'doc-1',
    title: 'Test Judgment',
    document_type: 'judgment',
    full_text: 'Full text content.',
    summary: 'Summary text.',
    created_at: '2024-01-15T00:00:00Z',
    language: 'en',
    keywords: ['contract'],
    legal_concepts: [{ concept_name: 'Due Process' }],
    issuing_body: { name: 'Supreme Court' },
    ...overrides,
  };
}

function createFilters(overrides: Partial<SimilarityFilters> = {}): SimilarityFilters {
  return {
    languages: [],
    dateRange: null,
    similarityThreshold: 0, // low threshold to include everything
    keywords: [],
    legalConcepts: [],
    ...overrides,
  };
}

function createSimilarity(
  id1: string,
  id2: string,
  similarity: number
): DocumentSimilarity {
  return {
    document_id_1: id1,
    document_id_2: id2,
    similarity,
  };
}

// ──────────────────────────────────────────────────────────
// useGraphData Hook
// ──────────────────────────────────────────────────────────

describe('useGraphData', () => {
  describe('empty input', () => {
    it('returns empty nodes and links when no documents are provided', () => {
      const { result } = renderHook(() =>
        useGraphData([], [], createFilters())
      );

      expect(result.current).toEqual({ nodes: [], links: [] });
    });
  });

  describe('node creation', () => {
    it('transforms documents into graph nodes with correct properties', () => {
      const doc = createDocument();
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      // With threshold < 10, isolated nodes are included
      expect(result.current.nodes).toHaveLength(1);
      const node = result.current.nodes[0];
      expect(node.id).toBe('doc-1');
      expect(node.title).toBe('Test Judgment');
      expect(node.documentType).toBe('judgment');
      expect(node.language).toBe('en');
      expect(node.keywords).toEqual(['contract']);
    });

    it('uses "Untitled Document" when title is null', () => {
      const doc = createDocument({ title: null });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].title).toBe('Untitled Document');
    });

    it('uses "unknown" when language is undefined', () => {
      const doc = createDocument({ language: undefined });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].language).toBe('unknown');
    });

    it('sets date to null when created_at is null', () => {
      const doc = createDocument({ created_at: null });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].date).toBeNull();
    });

    it('sets date to null when created_at is undefined', () => {
      const doc = createDocument({ created_at: undefined });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].date).toBeNull();
    });

    it('sets date to null when created_at is an invalid date string', () => {
      const doc = createDocument({ created_at: 'garbage' });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].date).toBeNull();
    });

    it('parses valid created_at into a Date object', () => {
      const doc = createDocument({ created_at: '2024-06-15T00:00:00Z' });
      const { result } = renderHook(() =>
        useGraphData([doc], [], createFilters({ similarityThreshold: 0 }))
      );

      expect(result.current.nodes[0].date).toBeInstanceOf(Date);
      expect(result.current.nodes[0].date!.getFullYear()).toBe(2024);
    });
  });

  describe('link creation', () => {
    it('creates links from similarities above threshold', () => {
      const docs = [
        createDocument({ document_id: 'a' }),
        createDocument({ document_id: 'b' }),
      ];
      const sims = [createSimilarity('a', 'b', 0.8)];
      const filters = createFilters({ similarityThreshold: 50 }); // 50% = 0.5

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].source).toBe('a');
      expect(result.current.links[0].target).toBe('b');
      expect(result.current.links[0].similarity).toBe(0.8);
    });

    it('excludes links below the similarity threshold', () => {
      const docs = [
        createDocument({ document_id: 'a' }),
        createDocument({ document_id: 'b' }),
      ];
      const sims = [createSimilarity('a', 'b', 0.3)];
      const filters = createFilters({ similarityThreshold: 50 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      expect(result.current.links).toHaveLength(0);
    });

  });

  describe('shared concepts', () => {
    it('identifies shared legal concepts between linked documents', () => {
      const docs = [
        createDocument({
          document_id: 'a',
          legal_concepts: [{ concept_name: 'Due Process' }, { concept_name: 'Fair Trial' }],
        }),
        createDocument({
          document_id: 'b',
          legal_concepts: [{ concept_name: 'due process' }, { concept_name: 'Habeas Corpus' }],
        }),
      ];
      const sims = [createSimilarity('a', 'b', 0.8)];
      const filters = createFilters({ similarityThreshold: 0 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      // 'due process' matches case-insensitively
      expect(result.current.links[0].sharedConcepts).toEqual(['due process']);
    });

    it('returns empty array when documents have no legal concepts', () => {
      const docs = [
        createDocument({ document_id: 'a', legal_concepts: undefined }),
        createDocument({ document_id: 'b', legal_concepts: undefined }),
      ];
      const sims = [createSimilarity('a', 'b', 0.9)];
      const filters = createFilters({ similarityThreshold: 0 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      expect(result.current.links[0].sharedConcepts).toEqual([]);
    });
  });

  describe('cluster metrics', () => {
    it('calculates cluster size and average similarity for connected nodes', () => {
      const docs = [
        createDocument({ document_id: 'a' }),
        createDocument({ document_id: 'b' }),
        createDocument({ document_id: 'c' }),
      ];
      const sims = [
        createSimilarity('a', 'b', 0.6),
        createSimilarity('a', 'c', 0.8),
      ];
      const filters = createFilters({ similarityThreshold: 0 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      const nodeA = result.current.nodes.find((n) => n.id === 'a');
      expect(nodeA?.clusterSize).toBe(2);
      expect(nodeA?.avgSimilarity).toBeCloseTo(0.7, 5);
    });
  });

  describe('language filtering', () => {
    it('filters documents by language', () => {
      const docs = [
        createDocument({ document_id: 'a', language: 'en' }),
        createDocument({ document_id: 'b', language: 'pl' }),
      ];
      const filters = createFilters({
        languages: ['en'],
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('a');
    });
  });

  describe('date range filtering', () => {
    it('excludes documents outside the date range', () => {
      const docs = [
        createDocument({ document_id: 'a', created_at: '2024-06-15T00:00:00Z' }),
        createDocument({ document_id: 'b', created_at: '2023-01-01T00:00:00Z' }),
      ];
      const filters = createFilters({
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('a');
    });

    it('does not exclude documents with null created_at when date filter is active', () => {
      const docs = [
        createDocument({ document_id: 'a', created_at: '2024-06-15T00:00:00Z' }),
        createDocument({ document_id: 'b', created_at: null }),
      ];
      const filters = createFilters({
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      // Both documents should be included: 'a' is in range, 'b' has null date (not excluded)
      expect(result.current.nodes).toHaveLength(2);
    });

    it('does not exclude documents with undefined created_at when date filter is active', () => {
      const docs = [
        createDocument({ document_id: 'a', created_at: '2024-06-15T00:00:00Z' }),
        createDocument({ document_id: 'b', created_at: undefined }),
      ];
      const filters = createFilters({
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(2);
    });

    it('does not exclude documents with invalid date strings when date filter is active', () => {
      const docs = [
        createDocument({ document_id: 'a', created_at: '2024-06-15T00:00:00Z' }),
        createDocument({ document_id: 'b', created_at: 'not-a-date' }),
      ];
      const filters = createFilters({
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        },
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(2);
    });
  });

  describe('keyword filtering', () => {
    it('includes only documents matching at least one keyword', () => {
      const docs = [
        createDocument({ document_id: 'a', keywords: ['contract', 'liability'] }),
        createDocument({ document_id: 'b', keywords: ['criminal'] }),
      ];
      const filters = createFilters({
        keywords: ['Contract'], // case-insensitive
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('a');
    });
  });

  describe('legal concept filtering', () => {
    it('includes only documents matching at least one legal concept', () => {
      const docs = [
        createDocument({
          document_id: 'a',
          legal_concepts: [{ concept_name: 'Due Process' }],
        }),
        createDocument({
          document_id: 'b',
          legal_concepts: [{ concept_name: 'Habeas Corpus' }],
        }),
      ];
      const filters = createFilters({
        legalConcepts: ['due process'],
        similarityThreshold: 0,
      });

      const { result } = renderHook(() =>
        useGraphData(docs, [], filters)
      );

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].id).toBe('a');
    });
  });

  describe('isolated node filtering', () => {
    it('removes isolated nodes when similarityThreshold >= 10', () => {
      const docs = [
        createDocument({ document_id: 'a' }),
        createDocument({ document_id: 'b' }),
        createDocument({ document_id: 'c' }),
      ];
      // Only a-b are connected, c is isolated
      const sims = [createSimilarity('a', 'b', 0.9)];
      const filters = createFilters({ similarityThreshold: 10 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      const nodeIds = result.current.nodes.map((n) => n.id);
      expect(nodeIds).toContain('a');
      expect(nodeIds).toContain('b');
      expect(nodeIds).not.toContain('c');
    });

    it('keeps isolated nodes when similarityThreshold < 10', () => {
      const docs = [
        createDocument({ document_id: 'a' }),
        createDocument({ document_id: 'b' }),
        createDocument({ document_id: 'c' }),
      ];
      const sims = [createSimilarity('a', 'b', 0.9)];
      const filters = createFilters({ similarityThreshold: 5 });

      const { result } = renderHook(() =>
        useGraphData(docs, sims, filters)
      );

      expect(result.current.nodes).toHaveLength(3);
    });
  });
});

// ──────────────────────────────────────────────────────────
// Utility Functions
// ──────────────────────────────────────────────────────────

describe('getNodeColor', () => {
  it('returns the correct color for a judgment node', () => {
    const node = { documentType: 'judgment' } as GraphNode;
    expect(getNodeColor(node)).toBe('#6366f1');
  });

  it('returns default color for unknown document type', () => {
    const prop = 'documentType' as const;
    const node = { [prop]: 'unknown' } as unknown as GraphNode;
    expect(getNodeColor(node)).toBe('#8B5CF6');
  });
});

describe('getEdgeWidth', () => {
  it('returns minimum width at similarity 0', () => {
    expect(getEdgeWidth(0)).toBe(0.5);
  });

  it('returns maximum width at similarity 1', () => {
    expect(getEdgeWidth(1)).toBe(3.5);
  });

  it('scales linearly with similarity', () => {
    expect(getEdgeWidth(0.5)).toBeCloseTo(2.0);
  });
});

describe('getEdgeOpacity', () => {
  it('returns minimum opacity at similarity 0', () => {
    expect(getEdgeOpacity(0)).toBeCloseTo(0.15);
  });

  it('returns maximum opacity at similarity 1', () => {
    expect(getEdgeOpacity(1)).toBeCloseTo(0.60);
  });
});

describe('getEdgeColor', () => {
  it('returns highlighted color when isHighlighted is true', () => {
    const link = { similarity: 0.5 } as GraphLink;
    const color = getEdgeColor(link, true);
    expect(color).toContain('oklch(0.64');
  });

  it('returns normal color when isHighlighted is false', () => {
    const link = { similarity: 0.5 } as GraphLink;
    const color = getEdgeColor(link, false);
    expect(color).toContain('oklch(0.55');
  });

  it('defaults to not highlighted', () => {
    const link = { similarity: 0.5 } as GraphLink;
    const color = getEdgeColor(link);
    expect(color).toContain('oklch(0.55');
  });
});

describe('formatDate', () => {
  it('formats a date in en-GB locale with short month', () => {
    const date = new Date('2024-06-15');
    const formatted = formatDate(date);
    // en-GB: "15 Jun 2024"
    expect(formatted).toContain('Jun');
    expect(formatted).toContain('2024');
    expect(formatted).toContain('15');
  });

  it('returns "Unknown date" when date is null', () => {
    expect(formatDate(null)).toBe('Unknown date');
  });
});

describe('truncateText', () => {
  it('returns the original text when shorter than maxLength', () => {
    expect(truncateText('short', 10)).toBe('short');
  });

  it('returns the original text when exactly maxLength', () => {
    expect(truncateText('12345', 5)).toBe('12345');
  });

  it('truncates and adds ellipsis when text exceeds maxLength', () => {
    const result = truncateText('Hello World!', 8);
    expect(result).toBe('Hello...');
    expect(result).toHaveLength(8);
  });
});
