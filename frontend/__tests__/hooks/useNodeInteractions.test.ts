/**
 * Tests for useNodeInteractions hook and utility functions
 *
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import {
  useNodeInteractions,
  shouldDimNode,
  getConnectedNodeIds,
  getNodeSize,
  getNodeOpacity,
} from '@/lib/hooks/useNodeInteractions';
import { DocumentType } from '@/types/search';
import type { GraphNode } from '@/components/similarity-viz/types';

// --- Test Data Factory ---

function createNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node-1',
    title: 'Test Node',
    documentType: DocumentType.JUDGMENT,
    documentId: 'doc-1',
    fullText: 'text',
    date: new Date('2024-01-01'),
    language: 'en',
    keywords: [],
    importance: 0.5,
    clusterSize: 2,
    avgSimilarity: 0.7,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────
// useNodeInteractions Hook
// ──────────────────────────────────────────────────────────

describe('useNodeInteractions', () => {
  describe('initial state', () => {
    it('starts with no hovered or selected node', () => {
      const { result } = renderHook(() => useNodeInteractions());

      expect(result.current.hoveredNode).toBeNull();
      expect(result.current.selectedNode).toBeNull();
    });
  });

  describe('handleNodeHover', () => {
    it('sets hoveredNode when a node is hovered', () => {
      const { result } = renderHook(() => useNodeInteractions());
      const node = createNode({ id: 'hover-1' });

      act(() => {
        result.current.handleNodeHover(node);
      });

      expect(result.current.hoveredNode).toBe('hover-1');
    });

    it('clears hoveredNode when null is passed', () => {
      const { result } = renderHook(() => useNodeInteractions());

      act(() => {
        result.current.handleNodeHover(createNode({ id: 'test' }));
      });
      expect(result.current.hoveredNode).toBe('test');

      act(() => {
        result.current.handleNodeHover(null);
      });
      expect(result.current.hoveredNode).toBeNull();
    });
  });

  describe('handleNodeClick', () => {
    it('selects a node on first click', () => {
      const onSelect = jest.fn();
      const { result } = renderHook(() => useNodeInteractions(onSelect));
      const node = createNode({ id: 'click-1' });

      act(() => {
        result.current.handleNodeClick(node);
      });

      expect(result.current.selectedNode).toBe('click-1');
      expect(onSelect).toHaveBeenCalledWith(node);
    });

    it('deselects a node on second click (toggle)', () => {
      const onSelect = jest.fn();
      const { result } = renderHook(() => useNodeInteractions(onSelect));
      const node = createNode({ id: 'toggle-1' });

      act(() => {
        result.current.handleNodeClick(node);
      });
      expect(result.current.selectedNode).toBe('toggle-1');

      act(() => {
        result.current.handleNodeClick(node);
      });
      expect(result.current.selectedNode).toBeNull();
      expect(onSelect).toHaveBeenCalledWith(null);
    });

    it('switches selection when clicking a different node', () => {
      const onSelect = jest.fn();
      const { result } = renderHook(() => useNodeInteractions(onSelect));

      act(() => {
        result.current.handleNodeClick(createNode({ id: 'a' }));
      });
      expect(result.current.selectedNode).toBe('a');

      act(() => {
        result.current.handleNodeClick(createNode({ id: 'b' }));
      });
      expect(result.current.selectedNode).toBe('b');
    });

    it('works without onNodeSelect callback', () => {
      const { result } = renderHook(() => useNodeInteractions());
      const node = createNode({ id: 'no-callback' });

      // Should not throw
      act(() => {
        result.current.handleNodeClick(node);
      });
      expect(result.current.selectedNode).toBe('no-callback');
    });
  });

  describe('handleNodeDoubleClick', () => {
    it('attempts to navigate to the document detail page', () => {
      const { result } = renderHook(() => useNodeInteractions());
      const node = createNode({ documentId: 'doc-123' });

      // jsdom does not actually navigate, so we verify the handler
      // runs without throwing. The implementation sets
      // window.location.href = `/documents/${node.documentId}`
      expect(() => {
        act(() => {
          result.current.handleNodeDoubleClick(node);
        });
      }).not.toThrow();
    });
  });

  describe('clearSelection', () => {
    it('clears the selected node', () => {
      const onSelect = jest.fn();
      const { result } = renderHook(() => useNodeInteractions(onSelect));

      act(() => {
        result.current.handleNodeClick(createNode({ id: 'sel' }));
      });
      expect(result.current.selectedNode).toBe('sel');

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedNode).toBeNull();
      expect(onSelect).toHaveBeenLastCalledWith(null);
    });
  });

  describe('isNodeHighlighted', () => {
    it('returns true for the hovered node', () => {
      const { result } = renderHook(() => useNodeInteractions());

      act(() => {
        result.current.handleNodeHover(createNode({ id: 'h1' }));
      });

      expect(result.current.isNodeHighlighted('h1')).toBe(true);
      expect(result.current.isNodeHighlighted('other')).toBe(false);
    });

    it('returns true for the selected node', () => {
      const { result } = renderHook(() => useNodeInteractions());

      act(() => {
        result.current.handleNodeClick(createNode({ id: 's1' }));
      });

      expect(result.current.isNodeHighlighted('s1')).toBe(true);
      expect(result.current.isNodeHighlighted('other')).toBe(false);
    });

    it('returns true if node is either hovered or selected', () => {
      const { result } = renderHook(() => useNodeInteractions());

      act(() => {
        result.current.handleNodeClick(createNode({ id: 'selected' }));
        result.current.handleNodeHover(createNode({ id: 'hovered' }));
      });

      expect(result.current.isNodeHighlighted('selected')).toBe(true);
      expect(result.current.isNodeHighlighted('hovered')).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────────────────
// shouldDimNode
// ──────────────────────────────────────────────────────────

describe('shouldDimNode', () => {
  it('returns false when no node is active (no hover or selection)', () => {
    const connected = new Set<string>();
    expect(shouldDimNode('any', null, null, connected)).toBe(false);
  });

  it('returns false for the active (selected) node itself', () => {
    const connected = new Set<string>();
    expect(shouldDimNode('active', null, 'active', connected)).toBe(false);
  });

  it('returns false for the active (hovered) node itself', () => {
    const connected = new Set<string>();
    expect(shouldDimNode('hov', 'hov', null, connected)).toBe(false);
  });

  it('returns false for connected nodes', () => {
    const connected = new Set(['neighbor']);
    expect(shouldDimNode('neighbor', null, 'active', connected)).toBe(false);
  });

  it('returns true for unconnected nodes when there is an active node', () => {
    const connected = new Set(['neighbor']);
    expect(shouldDimNode('far-away', null, 'active', connected)).toBe(true);
  });

  it('prefers selectedNode over hoveredNode', () => {
    const connected = new Set<string>();
    // selectedNode is 'sel', hoveredNode is 'hov'
    // The active node is selectedNode when both are present
    expect(shouldDimNode('sel', 'hov', 'sel', connected)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// getConnectedNodeIds
// ──────────────────────────────────────────────────────────

describe('getConnectedNodeIds', () => {
  it('returns connected node IDs from string-based links', () => {
    const links = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'd', target: 'e' },
    ];

    const connected = getConnectedNodeIds('a', links);
    expect(connected).toEqual(new Set(['b', 'c']));
  });

  it('returns connected node IDs from object-based links', () => {
    const links = [
      { source: { id: 'x' }, target: { id: 'y' } },
      { source: { id: 'z' }, target: { id: 'x' } },
    ];

    const connected = getConnectedNodeIds('x', links);
    expect(connected).toEqual(new Set(['y', 'z']));
  });

  it('handles mixed string and object sources/targets', () => {
    const links = [
      { source: 'a', target: { id: 'b' } },
      { source: { id: 'c' }, target: 'a' },
    ];

    const connected = getConnectedNodeIds('a', links);
    expect(connected).toEqual(new Set(['b', 'c']));
  });

  it('returns empty set for unconnected node', () => {
    const links = [{ source: 'x', target: 'y' }];
    expect(getConnectedNodeIds('z', links)).toEqual(new Set());
  });
});

// ──────────────────────────────────────────────────────────
// getNodeSize
// ──────────────────────────────────────────────────────────

describe('getNodeSize', () => {
  it('returns base size for a node with zero importance', () => {
    const node = createNode({ importance: 0 });
    const size = getNodeSize(node, false, false);
    // baseSize * (1 + 0 * 0.5) = 12 * 1 = 12
    expect(size).toBe(12);
  });

  it('scales up with importance', () => {
    const node = createNode({ importance: 1 });
    const size = getNodeSize(node, false, false);
    // baseSize * (1 + 1 * 0.5) = 12 * 1.5 = 18
    expect(size).toBe(18);
  });

  it('multiplies size by 1.33 for hovered node', () => {
    const node = createNode({ importance: 0 });
    const size = getNodeSize(node, true, false);
    // 12 * 1.33 = 15.96
    expect(size).toBeCloseTo(15.96);
  });

  it('multiplies size by 1.67 for selected node', () => {
    const node = createNode({ importance: 0 });
    const size = getNodeSize(node, false, true);
    // 12 * 1.67 = 20.04
    expect(size).toBeCloseTo(20.04);
  });

  it('selected takes precedence over hovered', () => {
    const node = createNode({ importance: 0 });
    const size = getNodeSize(node, true, true);
    // selected: 12 * 1.67 = 20.04
    expect(size).toBeCloseTo(20.04);
  });
});

// ──────────────────────────────────────────────────────────
// getNodeOpacity
// ──────────────────────────────────────────────────────────

describe('getNodeOpacity', () => {
  it('returns 0.3 when dimmed', () => {
    expect(getNodeOpacity(true, false, false)).toBe(0.3);
  });

  it('returns 1.0 when hovered (not dimmed)', () => {
    expect(getNodeOpacity(false, true, false)).toBe(1.0);
  });

  it('returns 1.0 when selected (not dimmed)', () => {
    expect(getNodeOpacity(false, false, true)).toBe(1.0);
  });

  it('returns 0.85 for normal state', () => {
    expect(getNodeOpacity(false, false, false)).toBe(0.85);
  });

  it('dimmed takes precedence over hovered/selected', () => {
    expect(getNodeOpacity(true, true, true)).toBe(0.3);
  });
});
