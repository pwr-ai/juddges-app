'use client';

/**
 * ReasoningDAG — DAG visualization of reasoning line relationships.
 * Uses react-force-graph-2d to render nodes (reasoning lines) and
 * directed edges (branch / merge / influence / drift events).
 */

import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Loader2, Target } from 'lucide-react';
import { BaseCard } from '@/lib/styles/components';
import { Button } from '@/components/ui/button';
import type { DAGNode, DAGEdge, DAGNodeStatus, DAGEdgeEventType } from '@/types/reasoning-lines';

// Dynamically import ForceGraph2D to avoid SSR issues (canvas-based)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Color maps
// ---------------------------------------------------------------------------

/** Node fill color keyed by status */
const NODE_STATUS_COLORS: Record<DAGNodeStatus, string> = {
  active: '#22c55e',     // green-500
  merged: '#3b82f6',     // blue-500
  superseded: '#9ca3af', // gray-400
  dormant: '#f59e0b',    // amber-500
};

/** Edge color keyed by event type */
const EDGE_EVENT_COLORS: Record<DAGEdgeEventType, string> = {
  branch: '#ef4444',    // red-500
  merge: '#22c55e',     // green-500
  influence: '#3b82f6', // blue-500
  drift: '#f97316',     // orange-500
};

/** Polish labels for legend */
const STATUS_LABELS: Record<DAGNodeStatus, string> = {
  active: 'Aktywna',
  merged: 'Polaczona',
  superseded: 'Zastapiona',
  dormant: 'Uspionia',
};

const EVENT_LABELS: Record<DAGEdgeEventType, string> = {
  branch: 'Rozgalezienie',
  merge: 'Polaczenie',
  influence: 'Wplyw',
  drift: 'Dryf',
};

// ---------------------------------------------------------------------------
// Graph data helpers — transform API types to react-force-graph format
// react-force-graph mutates nodes at runtime to add x/y position data
// ---------------------------------------------------------------------------

interface GraphNodeData {
  id: string;
  label: string;
  status: DAGNodeStatus;
  case_count: number;
  coherence_score: number;
  keywords: string[];
  /** Injected by react-force-graph at runtime */
  x?: number;
  y?: number;
}

interface GraphLinkData {
  source: string | GraphNodeData;
  target: string | GraphNodeData;
  event_type: DAGEdgeEventType;
  confidence: number;
  description: string;
}

interface ReasoningDAGProps {
  nodes: DAGNode[];
  edges: DAGEdge[];
  /** Height of the canvas in pixels (default 500) */
  height?: number;
}

export function ReasoningDAG({ nodes, edges, height = 500 }: ReasoningDAGProps) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  // Build the data object consumed by ForceGraph2D
  const graphData = useMemo(() => {
    const graphNodes: GraphNodeData[] = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      status: n.status,
      case_count: n.case_count,
      coherence_score: n.coherence_score,
      keywords: n.keywords,
    }));

    const graphLinks: GraphLinkData[] = edges.map((e) => ({
      source: e.source_id,
      target: e.target_id,
      event_type: e.event_type,
      confidence: e.confidence,
      description: e.description,
    }));

    return { nodes: graphNodes, links: graphLinks };
  }, [nodes, edges]);

  // Fit graph to viewport after data loads
  useEffect(() => {
    if (graphRef.current) {
      setTimeout(() => graphRef.current?.zoomToFit(400, 60), 200);
    }
  }, [graphData]);

  const handleCenterGraph = useCallback(() => {
    graphRef.current?.zoomToFit(400, 60);
  }, []);

  // Navigate to detail page on node click
  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any) => {
      if (node?.id) {
        router.push(`/reasoning-lines/${node.id}`);
      }
    },
    [router]
  );

  // Custom node rendering on canvas
  const renderNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const data = node as GraphNodeData;
      if (data.x == null || data.y == null) return;

      // Radius proportional to case_count (min 4, max 18)
      const radius = Math.max(4, Math.min(18, 4 + Math.sqrt(data.case_count) * 2));
      const color = NODE_STATUS_COLORS[data.status] ?? '#9ca3af';

      ctx.save();

      // Shadow for depth
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.12)';

      // Circle
      ctx.beginPath();
      ctx.arc(data.x, data.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Label — only render when zoomed in enough
      if (globalScale >= 0.6) {
        const label =
          data.label.length > 24 ? data.label.slice(0, 22) + '...' : data.label;
        const fontSize = Math.max(9, 11 / globalScale);
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Background for readability
        const textWidth = ctx.measureText(label).width;
        const labelY = data.y + radius + 3;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(data.x - textWidth / 2 - 2, labelY - 1, textWidth + 4, fontSize + 2);

        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(label, data.x, labelY);
      }

      ctx.restore();
    },
    []
  );

  // Custom link (edge) rendering — directed arrows colored by event type
  const renderLink = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (link: any, ctx: CanvasRenderingContext2D) => {
      const data = link as GraphLinkData & {
        source: GraphNodeData;
        target: GraphNodeData;
      };
      const src = data.source;
      const tgt = data.target;
      if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return;

      const color = EDGE_EVENT_COLORS[data.event_type] ?? '#9ca3af';
      // Width proportional to confidence (min 0.8, max 3)
      const width = 0.8 + data.confidence * 2.2;

      ctx.save();

      // Line
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = 0.7;
      ctx.stroke();

      // Arrowhead
      const arrowLen = 6;
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      // Position arrow slightly before the target node edge
      const targetRadius = Math.max(4, Math.min(18, 4 + Math.sqrt(data.target.case_count) * 2));
      const arrowX = tgt.x - Math.cos(angle) * (targetRadius + 4);
      const arrowY = tgt.y - Math.sin(angle) * (targetRadius + 4);

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();

      ctx.restore();
    },
    []
  );

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px] relative overflow-hidden">
      {/* Graph canvas */}
      <div style={{ height }} className="w-full">
        {/* eslint-disable @typescript-eslint/no-explicit-any */}
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData as any}
          nodeCanvasObject={renderNode as any}
          linkCanvasObject={renderLink as any}
          onNodeClick={handleNodeClick as any}
          dagMode="td"
          dagLevelDistance={80}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          backgroundColor="transparent"
          height={height}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
        {/* eslint-enable @typescript-eslint/no-explicit-any */}
      </div>

      {/* Center button — top right */}
      <div className="absolute top-3 right-3">
        <Button
          size="icon"
          variant="secondary"
          className="shadow-lg bg-background/95 backdrop-blur h-8 w-8"
          onClick={handleCenterGraph}
          title="Wycentruj graf"
        >
          <Target className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend — bottom left */}
      <div className="absolute bottom-3 left-3 bg-background/95 backdrop-blur rounded-xl border p-3 shadow-lg text-xs space-y-2 max-w-[220px]">
        {/* Node statuses */}
        <p className="font-medium text-foreground">Wezly (status)</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {(Object.keys(NODE_STATUS_COLORS) as DAGNodeStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: NODE_STATUS_COLORS[status] }}
              />
              <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>

        {/* Edge types */}
        <p className="font-medium text-foreground pt-1">Krawedzie (typ)</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {(Object.keys(EDGE_EVENT_COLORS) as DAGEdgeEventType[]).map((eventType) => (
            <div key={eventType} className="flex items-center gap-1.5">
              <div
                className="w-4 h-0.5 flex-shrink-0 rounded"
                style={{ backgroundColor: EDGE_EVENT_COLORS[eventType] }}
              />
              <span className="text-muted-foreground">{EVENT_LABELS[eventType]}</span>
            </div>
          ))}
        </div>
      </div>
    </BaseCard>
  );
}

export default ReasoningDAG;
