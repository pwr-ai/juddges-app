'use client';

/**
 * Graph Canvas Component
 * Main visualization area for document similarity network
 */

import React, { useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize, Target, Loader2 } from 'lucide-react';
import {
  GraphData,
  GraphNode,
  GraphLink,
  GraphLayout,
  ViewportState,
} from './types';
import {
  getNodeColor,
  getEdgeWidth,
  getEdgeOpacity,
  truncateText,
} from '@/lib/hooks/useGraphData';
import {
  getNodeSize,
  getNodeOpacity,
  shouldDimNode,
  getConnectedNodeIds,
} from '@/lib/hooks/useNodeInteractions';

// Dynamically import ForceGraph to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

interface GraphCanvasProps {
  graphData: GraphData;
  layout: GraphLayout;
  viewport: ViewportState;
  hoveredNode: string | null;
  selectedNode: string | null;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeClick: (node: GraphNode) => void;
  onViewportChange?: (viewport: ViewportState) => void;
  onFullscreen?: () => void;
  width?: number;
  height?: number;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  // layout,
  // viewport,
  hoveredNode,
  selectedNode,
  onNodeHover,
  onNodeClick,
  // onViewportChange,
  onFullscreen,
  width,
  height = 600,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  // Get document type statistics for legend
  const documentTypeStats = React.useMemo(() => {
    const stats = new Map<string, { count: number; color: string }>();

    graphData.nodes.forEach((node) => {
      const type = node.documentType;
      const current = stats.get(type) || { count: 0, color: getNodeColor(node) };
      stats.set(type, { ...current, count: current.count + 1 });
    });

    return Array.from(stats.entries()).map(([type, data]) => ({
      id: type,
      label: type.replace(/_/g, ' '),
      ...data,
    }));
  }, [graphData.nodes]);

  // Center graph on mount or when data changes
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  }, [graphData]);

  // Handle center graph button
  const handleCenterGraph = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50);
    }
  }, []);

  // Custom node rendering
  const renderNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHovered = node.id === hoveredNode;
      const isSelected = node.id === selectedNode;

      // Get connected nodes for dimming calculation
      const connectedNodeIds = getConnectedNodeIds(node.id, graphData.links);
      const isDimmed = shouldDimNode(
        node.id,
        hoveredNode,
        selectedNode,
        connectedNodeIds
      );

      // Calculate visual properties
      const size = getNodeSize(node, isHovered, isSelected);
      const opacity = getNodeOpacity(isDimmed, isHovered, isSelected);
      const color = getNodeColor(node);

      // Save context
      ctx.save();

      // Apply global opacity
      ctx.globalAlpha = opacity;

      // Shadow for depth (only on hover/select)
      if (isSelected || isHovered) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#6366f1' : '#ffffff';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Label (on hover or selection)
      if ((isHovered || isSelected) && globalScale >= 0.5) {
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const label = truncateText(node.title, 20);
        const labelY = node.y! + size + 12;

        // Label background
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(
          node.x! - textWidth / 2 - 4,
          labelY - 8,
          textWidth + 8,
          16
        );

        // Label text
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(label, node.x!, labelY);
      }

      // Restore context
      ctx.restore();
    },
    [hoveredNode, selectedNode, graphData.links]
  );

  // Custom link rendering
  const renderLink = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (link: GraphLink, ctx: CanvasRenderingContext2D, _globalScale: number) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;

      if (!source.x || !source.y || !target.x || !target.y) return;

      // Check if link should be highlighted
      const isHighlighted =
        source.id === hoveredNode ||
        target.id === hoveredNode ||
        source.id === selectedNode ||
        target.id === selectedNode;

      // Calculate visual properties
      const baseWidth = getEdgeWidth(link.similarity);
      const lineWidth = isHighlighted ? baseWidth + 1 : baseWidth;
      const baseOpacity = getEdgeOpacity(link.similarity);
      const opacity = isHighlighted ? baseOpacity + 0.3 : baseOpacity;

      // Draw line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (isHighlighted) {
        ctx.strokeStyle = `oklch(0.64 0.21 25.33 / ${opacity})`;
      } else {
        ctx.strokeStyle = `oklch(0.55 0.02 264.36 / ${opacity})`;
      }

      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.restore();
    },
    [hoveredNode, selectedNode]
  );

  return (
    <div className="relative flex-1 bg-gradient-to-br from-background via-background to-muted/5">
      {/* Main Graph */}
      <div className="absolute inset-0">
        {/* eslint-disable @typescript-eslint/no-explicit-any */}
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData as any}
          nodeCanvasObject={renderNode as any}
          linkCanvasObject={renderLink as any}
          onNodeClick={onNodeClick as any}
          onNodeHover={onNodeHover as any}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          backgroundColor="transparent"
          width={width}
          height={height}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
        {/* eslint-enable @typescript-eslint/no-explicit-any */}
      </div>

      {/* Legend Overlay - Bottom Left */}
      <Card className="absolute bottom-4 left-4 w-64 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Document Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {documentTypeStats.map((type) => (
            <div key={type.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              <span className="text-xs flex-1 capitalize">{type.label}</span>
              <Badge variant="secondary" className="text-[10px]">
                {type.count}
              </Badge>
            </div>
          ))}

          <div className="border-t pt-2 mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-primary" />
              <span className="text-xs text-muted-foreground">
                High similarity
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-muted-foreground opacity-50" />
              <span className="text-xs text-muted-foreground">
                Low similarity
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions - Top Right */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {onFullscreen && (
          <Button
            size="icon"
            variant="secondary"
            className="shadow-lg bg-background/95 backdrop-blur"
            onClick={onFullscreen}
            title="Toggle fullscreen"
          >
            <Maximize className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="secondary"
          className="shadow-lg bg-background/95 backdrop-blur"
          onClick={handleCenterGraph}
          title="Center graph"
        >
          <Target className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Badge - Top Left */}
      <div className="absolute top-4 left-4">
        <Badge variant="secondary" className="shadow-lg bg-background/95 backdrop-blur">
          {graphData.nodes.length} documents • {graphData.links.length}{' '}
          connections
        </Badge>
      </div>
    </div>
  );
};

export default GraphCanvas;
