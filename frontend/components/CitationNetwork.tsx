'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Download,
  X,
  Filter,
  FileText,
  GripVertical,
  Network,
  RefreshCw,
  Scale,
  TrendingUp,
  BookOpen,
} from 'lucide-react';
import type {
  CitationNetworkData,
  CitationNode,
  CitationEdge,
  CitationNetworkControls,
} from '@/types/citation-network';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/styles/components/tooltip';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  LoadingIndicator,
  EmptyState,
  SecondaryButton,
  IconButton,
  BaseCard,
  SearchInput,
  ErrorCard,
} from '@/lib/styles/components';

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

// Document type color scheme (consistent with existing application)
const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  'court_judgment': '#1f77b4',
  'tax_ruling': '#ff7f0e',
  'legislation': '#2ca02c',
  'administrative_decision': '#d62728',
  'tax_interpretation': '#9467bd',
  'judgment': '#1f77b4',
  'legal_opinion': '#8c564b',
  'regulation': '#e377c2',
  'guideline': '#7f7f7f',
  'other': '#bcbd22',
};

const DEFAULT_COLOR = '#17becf';

interface CitationNetworkProps {
  className?: string;
}

const CitationNetwork: React.FC<CitationNetworkProps> = ({ className = '' }) => {
  // State management
  const [networkData, setNetworkData] = useState<CitationNetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedNode, setSelectedNode] = useState<CitationNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<CitationNode | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [sliderValue, setSliderValue] = useState<number>(50);
  const [minRefsSlider, setMinRefsSlider] = useState<number>(1);

  // Side panel state
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // Control state
  const [controls, setControls] = useState<CitationNetworkControls>({
    sampleSize: 50,
    minSharedRefs: 1,
    selectedDocumentTypes: [],
  });

  // Available document types
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([]);

  // Cache for API responses
  const cacheRef = useRef<Map<string, CitationNetworkData>>(new Map());

  // Debounce slider changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sliderValue !== controls.sampleSize || minRefsSlider !== controls.minSharedRefs) {
        setControls(prev => ({
          ...prev,
          sampleSize: sliderValue,
          minSharedRefs: minRefsSlider,
        }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [sliderValue, minRefsSlider, controls.sampleSize, controls.minSharedRefs]);

  /**
   * Fetch citation network data from API
   */
  const fetchNetworkData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        sample_size: controls.sampleSize.toString(),
        min_shared_refs: controls.minSharedRefs.toString(),
      });

      if (controls.selectedDocumentTypes.length > 0) {
        params.append('document_types', controls.selectedDocumentTypes.join(','));
      }

      const cacheKey = params.toString();

      // Check cache first
      if (cacheRef.current.has(cacheKey)) {
        const cachedData = cacheRef.current.get(cacheKey)!;
        setNetworkData(cachedData);
        const types = Array.from(new Set(cachedData.nodes.map(node => node.document_type)));
        setAvailableDocumentTypes(prev => prev.length > 0 ? prev : types);
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/documents/citation-network?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch citation network: ${response.statusText}`);
      }

      const data: CitationNetworkData = await response.json();
      setNetworkData(data);

      // Extract document types
      if (data.nodes.length > 0) {
        const types = Array.from(new Set(data.nodes.map(node => node.document_type)));
        setAvailableDocumentTypes(prev => prev.length > 0 ? prev : types);
      }

      // Store in cache
      cacheRef.current.set(cacheKey, data);
    } catch (err) {
      console.error('Error fetching citation network:', err);
      setError(err instanceof Error ? err.message : 'Failed to load citation network');
    } finally {
      setLoading(false);
    }
  }, [controls]);

  // Initial fetch
  useEffect(() => {
    fetchNetworkData();
  }, [fetchNetworkData]);

  /**
   * Get node color based on document type
   */
  const getNodeColor = useCallback((node: CitationNode): string => {
    return DOCUMENT_TYPE_COLORS[node.document_type] || DEFAULT_COLOR;
  }, []);

  /**
   * Get connected documents for selected node
   */
  const getConnectedDocuments = useCallback((): Array<{ id: string; title: string; document_type: string; shared_refs: string[]; weight: number }> => {
    if (!selectedNode || !networkData) return [];

    return networkData.edges
      .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .map(edge => {
        const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
        const otherNode = networkData.nodes.find(n => n.id === otherId);
        return {
          id: otherId,
          title: otherNode?.title || 'Unknown',
          document_type: otherNode?.document_type || 'unknown',
          shared_refs: edge.shared_refs,
          weight: edge.weight,
        };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 15);
  }, [selectedNode, networkData]);

  /**
   * Get edges connected to hovered node
   */
  const getHoveredEdges = useMemo((): CitationEdge[] => {
    if (!hoveredNode || !networkData) return [];

    const connectedEdges = networkData.edges.filter(
      edge => edge.source === hoveredNode.id || edge.target === hoveredNode.id
    );

    // Sort by weight and take top 20
    return connectedEdges
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20);
  }, [hoveredNode, networkData]);

  /**
   * Search and highlight nodes
   */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !networkData) {
      setHighlightedNodes(new Set());
      return;
    }

    const matchingNodes = new Set<string>();
    const lowerQuery = query.toLowerCase();

    networkData.nodes.forEach(node => {
      if (
        node.title.toLowerCase().includes(lowerQuery) ||
        node.document_type.toLowerCase().includes(lowerQuery) ||
        (node.metadata.document_number || '').toLowerCase().includes(lowerQuery) ||
        node.references.some(r => r.toLowerCase().includes(lowerQuery))
      ) {
        matchingNodes.add(node.id);
      }
    });

    setHighlightedNodes(matchingNodes);

    if (matchingNodes.size > 0) {
      const firstMatch = networkData.nodes.find(n => matchingNodes.has(n.id));
      if (firstMatch) setSelectedNode(firstMatch);
    }
  }, [networkData]);

  /**
   * Export graph as PNG
   */
  const exportToPNG = useCallback(() => {
    const plotElement = document.querySelector('.js-plotly-plot') as HTMLElement;
    if (!plotElement) return;

    import('plotly.js-dist').then((Plotly) => {
      Plotly.downloadImage(plotElement, {
        format: 'png',
        width: 1920,
        height: 1080,
        filename: 'citation-network'
      });
    });
  }, []);

  /**
   * Toggle document type filter
   */
  const toggleDocumentType = useCallback((type: string) => {
    setControls(prev => {
      const types = prev.selectedDocumentTypes.includes(type)
        ? prev.selectedDocumentTypes.filter(t => t !== type)
        : [...prev.selectedDocumentTypes, type];
      return { ...prev, selectedDocumentTypes: types };
    });
  }, []);

  /**
   * Handle panel resize
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isResizing) {
        const newWidth = window.innerWidth - e.clientX;
        setPanelWidth(Math.max(300, Math.min(600, newWidth)));
      }
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  /**
   * Prepare Plotly data for citation network
   */
  const plotData = useMemo(() => {
    if (!networkData) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: any[] = [];

    // Node size based on citation count (authority score)
    const maxCitations = Math.max(...networkData.nodes.map(n => n.citation_count), 1);
    const nodeSizes = networkData.nodes.map(n => {
      const baseSize = 8;
      const scaledSize = (n.citation_count / maxCitations) * 16;
      return baseSize + scaledSize;
    });

    // Base layer: all document nodes
    const baseNodes = {
      x: networkData.nodes.map(n => n.x),
      y: networkData.nodes.map(n => n.y),
      mode: 'markers',
      type: 'scatter' as const,
      name: 'Documents',
      marker: {
        size: nodeSizes,
        color: networkData.nodes.map(n => getNodeColor(n)),
        opacity: networkData.nodes.map(n => {
          if (highlightedNodes.size > 0 && !highlightedNodes.has(n.id)) return 0.15;
          if (hoveredNode && n.id !== hoveredNode.id) {
            const isConnected = getHoveredEdges.some(
              edge => edge.source === n.id || edge.target === n.id
            );
            return isConnected ? 0.9 : 0.15;
          }
          return 0.85;
        }),
        line: {
          width: networkData.nodes.map(n => {
            if (selectedNode?.id === n.id) return 3;
            if (hoveredNode?.id === n.id) return 2;
            return 0.5;
          }),
          color: networkData.nodes.map(n => {
            if (selectedNode?.id === n.id) return '#000';
            if (hoveredNode?.id === n.id) return '#333';
            return 'rgba(0,0,0,0.1)';
          }),
        }
      },
      text: networkData.nodes.map(n =>
        `<b>${n.title}</b><br>` +
        `Type: ${n.document_type.replace(/_/g, ' ')}<br>` +
        `Citations: ${n.citation_count}<br>` +
        `Authority: ${(n.authority_score * 100).toFixed(1)}%<br>` +
        `${n.year ? `Year: ${n.year}<br>` : ''}` +
        `${n.metadata.court_name ? `Court: ${n.metadata.court_name}` : ''}`
      ),
      hoverinfo: 'text',
      customdata: networkData.nodes.map(n => n.id),
      showlegend: false,
    };

    traces.push(baseNodes);

    // Hover layer: citation edges when hovering over a node
    if (hoveredNode && getHoveredEdges.length > 0) {
      const edgeX: (number | null)[] = [];
      const edgeY: (number | null)[] = [];

      getHoveredEdges.forEach(edge => {
        const sourceNode = networkData.nodes.find(n => n.id === edge.source);
        const targetNode = networkData.nodes.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
          edgeX.push(sourceNode.x, targetNode.x, null);
          edgeY.push(sourceNode.y, targetNode.y, null);
        }
      });

      traces.push({
        x: edgeX,
        y: edgeY,
        mode: 'lines',
        type: 'scatter' as const,
        name: 'Shared References',
        line: {
          width: 2,
          color: 'rgba(59, 130, 246, 0.4)',
        },
        hoverinfo: 'skip',
        showlegend: false,
      });
    }

    return traces;
  }, [networkData, hoveredNode, selectedNode, highlightedNodes, getHoveredEdges, getNodeColor]);

  /**
   * Plotly layout configuration
   */
  const plotLayout = useMemo(() => ({
    xaxis: {
      showgrid: false,
      zeroline: false,
      showticklabels: false,
    },
    yaxis: {
      showgrid: false,
      zeroline: false,
      showticklabels: false,
    },
    hovermode: 'closest' as const,
    showlegend: false,
    margin: { l: 20, r: 20, t: 20, b: 20 },
    plot_bgcolor: '#f9fafb',
    paper_bgcolor: '#ffffff',
  }), []);

  const plotConfig = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d' as const, 'select2d' as const],
    toImageButtonOptions: {
      format: 'png' as const,
      filename: 'citation-network',
      height: 1080,
      width: 1920,
      scale: 2,
    }
  }), []);

  /**
   * Handle Plotly click events
   */
  const handlePlotClick = useCallback((event: { points?: Array<{ customdata?: string }> }) => {
    if (event.points && event.points.length > 0 && networkData) {
      const nodeId = event.points[0].customdata;
      if (nodeId) {
        const node = networkData.nodes.find(n => n.id === nodeId);
        setSelectedNode(node || null);
      }
    }
  }, [networkData]);

  /**
   * Handle Plotly hover events
   */
  const handlePlotHover = useCallback((event: { points?: Array<{ customdata?: string }> }) => {
    if (event.points && event.points.length > 0 && networkData) {
      const nodeId = event.points[0].customdata;
      if (nodeId) {
        const node = networkData.nodes.find(n => n.id === nodeId);
        setHoveredNode(node || null);
      }
    }
  }, [networkData]);

  const handlePlotUnhover = useCallback(() => {
    setHoveredNode(null);
  }, []);

  // ===== Render =====

  if (loading && !networkData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Citation Network</h1>
        </div>
        <div className="flex items-center justify-center min-h-[500px]">
          <LoadingIndicator message="Building citation network..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Citation Network</h1>
        </div>
        <ErrorCard
          title="Failed to load citation network"
          message={error}
          onRetry={fetchNetworkData}
          retryLabel="Retry"
        />
      </div>
    );
  }

  if (!networkData || networkData.nodes.length === 0) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Citation Network</h1>
        </div>
        <EmptyState
          title="No citation data available"
          description="No documents with legal references were found. Try adjusting the filters."
        />
      </div>
    );
  }

  const connectedDocs = getConnectedDocuments();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Citation Network</h1>
            <p className="text-sm text-muted-foreground">
              Visualizing shared legal references between documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton icon={Filter} onClick={() => setShowControls(!showControls)} aria-label="Toggle Controls" />
            </TooltipTrigger>
            <TooltipContent>Toggle Controls</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton icon={Download} onClick={exportToPNG} aria-label="Export as PNG" />
            </TooltipTrigger>
            <TooltipContent>Export as PNG</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton icon={RefreshCw} onClick={fetchNetworkData} aria-label="Refresh Data" />
            </TooltipTrigger>
            <TooltipContent>Refresh Data</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Statistics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BaseCard className="p-3 text-center">
          <div className="text-2xl font-bold text-primary">{networkData.statistics.total_nodes}</div>
          <div className="text-xs text-muted-foreground">Documents</div>
        </BaseCard>
        <BaseCard className="p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{networkData.statistics.total_edges}</div>
          <div className="text-xs text-muted-foreground">Connections</div>
        </BaseCard>
        <BaseCard className="p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{networkData.statistics.avg_citations.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">Avg Citations</div>
        </BaseCard>
        <BaseCard className="p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{(networkData.statistics.avg_authority_score * 100).toFixed(0)}%</div>
          <div className="text-xs text-muted-foreground">Avg Authority</div>
        </BaseCard>
      </div>

      {/* Main Content Area */}
      <div className="flex gap-4 relative" style={{ minHeight: '600px' }}>
        {/* Controls Panel */}
        {showControls && (
          <BaseCard className="w-72 flex-shrink-0 p-4 space-y-5 overflow-y-auto max-h-[700px]">
            <div>
              <h3 className="text-sm font-semibold mb-1">Network Controls</h3>
              <p className="text-xs text-muted-foreground">Adjust visualization parameters</p>
            </div>

            <Separator />

            {/* Sample Size */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Documents: {sliderValue}
              </Label>
              <Slider
                value={[sliderValue]}
                onValueChange={([v]) => setSliderValue(v)}
                min={10}
                max={200}
                step={10}
              />
            </div>

            {/* Min Shared References */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Min Shared Refs: {minRefsSlider}
              </Label>
              <Slider
                value={[minRefsSlider]}
                onValueChange={([v]) => setMinRefsSlider(v)}
                min={1}
                max={5}
                step={1}
              />
              <p className="text-[10px] text-muted-foreground">
                Higher values show stronger connections only
              </p>
            </div>

            <Separator />

            {/* Document Type Filters */}
            {availableDocumentTypes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Document Types</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableDocumentTypes.map(type => (
                    <Badge
                      key={type}
                      variant={controls.selectedDocumentTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer text-[10px] px-2 py-0.5"
                      onClick={() => toggleDocumentType(type)}
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-1 inline-block"
                        style={{ backgroundColor: DOCUMENT_TYPE_COLORS[type] || DEFAULT_COLOR }}
                      />
                      {type.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Most Cited References */}
            {networkData.statistics.most_cited_refs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  Top Legal References
                </Label>
                <div className="space-y-1">
                  {networkData.statistics.most_cited_refs.slice(0, 5).map((ref, i) => (
                    <div key={i} className="text-[10px] flex items-start gap-1.5">
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 flex-shrink-0">
                        {ref.count}
                      </Badge>
                      <span className="text-muted-foreground line-clamp-2">{ref.reference}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Search</Label>
              <SearchInput
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search documents..."
              />
              {highlightedNodes.size > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {highlightedNodes.size} match{highlightedNodes.size !== 1 ? 'es' : ''}
                </p>
              )}
            </div>
          </BaseCard>
        )}

        {/* Graph Area */}
        <div className="flex-1 relative">
          <BaseCard className="h-full overflow-hidden">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <LoadingIndicator message="Updating network..." />
              </div>
            )}
            <Plot
              data={plotData}
              layout={plotLayout}
              config={plotConfig}
              style={{ width: '100%', height: '600px' }}
              onClick={handlePlotClick}
              onHover={handlePlotHover}
              onUnhover={handlePlotUnhover}
            />
          </BaseCard>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <>
            {/* Resize Handle */}
            <div
              className="w-1 cursor-col-resize hover:bg-primary/20 transition-colors flex-shrink-0 flex items-center"
              onMouseDown={() => setIsResizing(true)}
            >
              <GripVertical className="h-6 w-4 text-muted-foreground" />
            </div>

            <BaseCard
              className="flex-shrink-0 p-4 overflow-y-auto"
              style={{ width: panelWidth, maxHeight: '700px' }}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-tight line-clamp-3">
                      {selectedNode.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        <span
                          className="w-1.5 h-1.5 rounded-full mr-1 inline-block"
                          style={{ backgroundColor: getNodeColor(selectedNode) }}
                        />
                        {selectedNode.document_type.replace(/_/g, ' ')}
                      </Badge>
                      {selectedNode.year && (
                        <span className="text-[10px] text-muted-foreground">{selectedNode.year}</span>
                      )}
                    </div>
                  </div>
                  <IconButton icon={X} onClick={() => setSelectedNode(null)} className="flex-shrink-0" aria-label="Close panel" />
                </div>

                <Separator />

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <div className="text-lg font-bold text-primary">{selectedNode.citation_count}</div>
                    <div className="text-[10px] text-muted-foreground">Legal Citations</div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <div className="text-lg font-bold text-amber-600">
                      {(selectedNode.authority_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">Authority Score</div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="space-y-1.5">
                  {selectedNode.metadata.court_name && (
                    <div className="flex items-center gap-2 text-xs">
                      <Scale className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{selectedNode.metadata.court_name}</span>
                    </div>
                  )}
                  {selectedNode.metadata.document_number && (
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">{selectedNode.metadata.document_number}</span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Legal References */}
                {selectedNode.references.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      Legal References ({selectedNode.references.length})
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {selectedNode.references.map((ref, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground leading-tight pl-2 border-l-2 border-primary/20">
                          {ref}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Connected Documents */}
                {connectedDocs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Connected Documents ({connectedDocs.length})
                    </h4>
                    <div className="space-y-2">
                      {connectedDocs.map(doc => (
                        <div
                          key={doc.id}
                          className="p-2 rounded-lg bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors"
                          onClick={() => {
                            const node = networkData?.nodes.find(n => n.id === doc.id);
                            if (node) setSelectedNode(node);
                          }}
                        >
                          <div className="text-xs font-medium line-clamp-2">{doc.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {doc.shared_refs.length} shared ref{doc.shared_refs.length !== 1 ? 's' : ''}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">
                              {(doc.weight * 100).toFixed(0)}% overlap
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* View Document Link */}
                <SecondaryButton
                  className="w-full text-xs"
                  onClick={() => {
                    window.open(`/documents/${encodeURIComponent(selectedNode.id)}`, '_blank');
                  }}
                >
                  <FileText className="h-3 w-3 mr-1" />
                  View Full Document
                </SecondaryButton>
              </div>
            </BaseCard>
          </>
        )}
      </div>
    </div>
  );
};

export default CitationNetwork;
