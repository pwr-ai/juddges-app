/**
 * Hook for managing node and graph interactions
 */

import { useCallback, useState } from 'react';
import { GraphNode } from '@/components/similarity-viz/types';

export interface NodeInteractionHandlers {
  hoveredNode: string | null;
  selectedNode: string | null;
  handleNodeHover: (node: GraphNode | null) => void;
  handleNodeClick: (node: GraphNode) => void;
  handleNodeDoubleClick: (node: GraphNode) => void;
  clearSelection: () => void;
  isNodeHighlighted: (nodeId: string) => boolean;
}

/**
 * Hook for managing node interactions (hover, click, selection)
 */
export const useNodeInteractions = (
  onNodeSelect?: (node: GraphNode | null) => void
): NodeInteractionHandlers => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node?.id || null);
  }, []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const newSelection = selectedNode === node.id ? null : node.id;
      setSelectedNode(newSelection);

      // Callback for parent component
      if (onNodeSelect) {
        onNodeSelect(newSelection ? node : null);
      }

      // Analytics tracking (optional)
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'similarity_viz_node_clicked', {
          document_type: node.documentType,
          cluster_size: node.clusterSize,
        });
      }
    },
    [selectedNode, onNodeSelect]
  );

  const handleNodeDoubleClick = useCallback((node: GraphNode) => {
    // Navigate to document detail page
    if (typeof window !== 'undefined') {
      window.location.href = `/documents/${node.documentId}`;
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    if (onNodeSelect) {
      onNodeSelect(null);
    }
  }, [onNodeSelect]);

  const isNodeHighlighted = useCallback(
    (nodeId: string): boolean => {
      return nodeId === hoveredNode || nodeId === selectedNode;
    },
    [hoveredNode, selectedNode]
  );

  return {
    hoveredNode,
    selectedNode,
    handleNodeHover,
    handleNodeClick,
    handleNodeDoubleClick,
    clearSelection,
    isNodeHighlighted,
  };
};

/**
 * Check if a node should be dimmed based on current hover/selection
 */
export const shouldDimNode = (
  nodeId: string,
  hoveredNode: string | null,
  selectedNode: string | null,
  connectedNodeIds: Set<string>
): boolean => {
  const activeNode = selectedNode || hoveredNode;

  if (!activeNode) {
    return false;
  }

  if (nodeId === activeNode) {
    return false;
  }

  return !connectedNodeIds.has(nodeId);
};

/**
 * Get the set of connected node IDs for a given node
 */
export const getConnectedNodeIds = (
  nodeId: string,
  links: Array<{
    source: string | { id: string };
    target: string | { id: string };
  }>
): Set<string> => {
  const connected = new Set<string>();

  links.forEach((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;

    if (sourceId === nodeId) {
      connected.add(targetId);
    } else if (targetId === nodeId) {
      connected.add(sourceId);
    }
  });

  return connected;
};

/**
 * Calculate node size based on importance and interaction state
 */
export const getNodeSize = (
  node: GraphNode,
  isHovered: boolean,
  isSelected: boolean
): number => {
  const baseSize = 12;
  const importanceMultiplier = 1 + node.importance * 0.5; // 1.0 to 1.5

  let size = baseSize * importanceMultiplier;

  if (isSelected) {
    size *= 1.67; // 20px for selected
  } else if (isHovered) {
    size *= 1.33; // 16px for hovered
  }

  return size;
};

/**
 * Get node opacity based on dim state
 */
export const getNodeOpacity = (
  isDimmed: boolean,
  isHovered: boolean,
  isSelected: boolean
): number => {
  if (isDimmed) {
    return 0.3;
  }

  if (isSelected || isHovered) {
    return 1.0;
  }

  return 0.85;
};
