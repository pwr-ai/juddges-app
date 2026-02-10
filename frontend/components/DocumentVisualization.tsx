'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  Download,
  Info,
  X,
  Filter,
  FileText,
  GripVertical,
  Network,
  RefreshCw,
} from 'lucide-react';
import {
  SimilarityGraphData,
  GraphNode,
  GraphControls,
  SimilarDocument
} from '@/types/similarity-graph';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/styles/components/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  LoadingIndicator,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  ToggleButton,
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
  'legal_opinion': '#8c564b',
  'regulation': '#e377c2',
  'guideline': '#7f7f7f',
  'other': '#bcbd22',
};

const DEFAULT_COLOR = '#17becf';

/**
 * Typing animation component for text
 */
function TypingText({
  text,
  className,
  speed = 50
}: {
  text: string;
  className?: string;
  speed?: number;
}): React.JSX.Element {
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);
  const cursorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setDisplayedText("");
    indexRef.current = 0;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      } else {
        clearInterval(interval);
        // Blink cursor after typing is complete
        cursorIntervalRef.current = setInterval(() => {
          setShowCursor((prev) => !prev);
        }, 530);
      }
    }, speed);

    return () => {
      clearInterval(interval);
      if (cursorIntervalRef.current) {
        clearInterval(cursorIntervalRef.current);
        cursorIntervalRef.current = null;
      }
    };
  }, [text, speed]);

  return (
    <p className={className}>
      {displayedText}
      {showCursor && (
        <motion.span
          className="inline-block w-0.5 h-[1.2em] bg-primary ml-1 align-middle"
          animate={{
            opacity: [1, 1, 0, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            times: [0, 0.45, 0.5, 1],
          }}
        />
      )}
    </p>
  );
}

interface DocumentVisualizationProps {
  className?: string;
}

const DocumentVisualization: React.FC<DocumentVisualizationProps> = ({ className = '' }) => {
  // State management
  const [graphData, setGraphData] = useState<SimilarityGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingPlot, setLoadingPlot] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [sliderValue, setSliderValue] = useState<number>(200);

  // Side panel state
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  // Control state
  const [controls, setControls] = useState<GraphControls>({
    sampleSize: 200,
    similarityThreshold: 0.7,
    selectedDocumentTypes: [],
    enableClustering: false,
    layoutAlgorithm: 'force-directed',
  });

  // Available document types (extracted from graph data)
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([]);

  // Cache for API responses
  const cacheRef = React.useRef<Map<string, SimilarityGraphData>>(new Map());

  // Update slider value when controls change externally
  useEffect(() => {
    setSliderValue(controls.sampleSize);
  }, [controls.sampleSize]);

  // Debounce slider changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sliderValue !== controls.sampleSize) {
        setControls(prev => ({ ...prev, sampleSize: sliderValue }));
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [sliderValue, controls.sampleSize]);

  /**
   * Fetch graph data from API with caching and progressive loading
   */
  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingStats(true);
      // Only load config on first load
      if (isFirstLoad) {
        setLoadingConfig(true);
      }
      setLoadingPlot(true);
      setError(null);

      const params = new URLSearchParams({
        sample_size: controls.sampleSize.toString(),
        similarity_threshold: controls.similarityThreshold.toString(),
        include_clusters: controls.enableClustering.toString(),
      });

      if (controls.selectedDocumentTypes.length > 0) {
        params.append('document_types', controls.selectedDocumentTypes.join(','));
      }

      const cacheKey = params.toString();

      // Check cache first
      if (cacheRef.current.has(cacheKey)) {
        const cachedData = cacheRef.current.get(cacheKey)!;
        
        // Progressive loading from cache - show with small delays for consistency
        if (cachedData.statistics) {
          setGraphData(prev => ({ 
            ...prev, 
            statistics: cachedData.statistics,
            nodes: prev?.nodes || [],
            edges: prev?.edges || []
          } as SimilarityGraphData));
          setTimeout(() => setLoadingStats(false), 50);
        }
        
        // Load config (document types) quickly - only on first load
        if (isFirstLoad) {
          const types = Array.from(new Set(cachedData.nodes.map(node => node.document_type)));
          setAvailableDocumentTypes(types);
          setTimeout(() => setLoadingConfig(false), 100);
        }
        
        // Load full graph data
        setGraphData(cachedData);
        setTimeout(() => {
          setLoadingPlot(false);
          setLoading(false);
          setIsFirstLoad(false);
        }, 150);
        return;
      }

      const response = await fetch(`/api/documents/similarity-graph?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch graph data: ${response.statusText}`);
      }

      // Parse full response
      const data: SimilarityGraphData = await response.json();
      
      // Progressive updates with small delays for better UX perception
      // Update statistics first (show after 100ms)
      if (data.statistics) {
        setGraphData(prev => ({ 
          ...prev, 
          statistics: data.statistics,
          nodes: prev?.nodes || [],
          edges: prev?.edges || []
        } as SimilarityGraphData));
        setTimeout(() => {
          setLoadingStats(false);
        }, 100);
      }
      
      // Update config (document types) next (show after 200ms) - only on first load
      if (isFirstLoad && data.nodes && data.nodes.length > 0) {
        const types = Array.from(new Set(data.nodes.map(node => node.document_type)));
        setAvailableDocumentTypes(types);
        setTimeout(() => {
          setLoadingConfig(false);
        }, 200);
      }
      
      // Update full graph data last (show after 300ms)
      setGraphData(data);
      setTimeout(() => {
        setLoadingPlot(false);
        setLoading(false);
        setIsFirstLoad(false);
      }, 300);

      // Store in cache
      cacheRef.current.set(cacheKey, data);

    } catch (err) {
      console.error('Error fetching graph data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
      setLoadingStats(false);
      setLoadingConfig(false);
      setLoadingPlot(false);
      setIsFirstLoad(false);
    } finally {
      setLoading(false);
    }
  }, [controls, isFirstLoad]);

  // Initial fetch
  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  /**
   * Get node color based on document type or cluster
   */
  const getNodeColor = useCallback((node: GraphNode): string => {
    if (controls.enableClustering && node.cluster_id !== null) {
      const clusterColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'];
      return clusterColors[node.cluster_id % clusterColors.length];
    }
    return DOCUMENT_TYPE_COLORS[node.document_type] || DEFAULT_COLOR;
  }, [controls.enableClustering]);

  /**
   * Get similar documents for selected node
   */
  const getSimilarDocuments = useCallback((): SimilarDocument[] => {
    if (!selectedNode || !graphData) return [];

    return graphData.edges
      .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .map(edge => {
        const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
        const otherNode = graphData.nodes.find(n => n.id === otherId);
        return {
          id: otherId,
          title: otherNode?.title || 'Unknown',
          document_type: otherNode?.document_type || 'unknown',
          similarity: edge.similarity,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);
  }, [selectedNode, graphData]);

  /**
   * Get edges connected to hovered node (top 20 by spatial proximity)
   */
  const getHoveredEdges = useMemo(() => {
    if (!hoveredNode || !graphData) return [];

    // Get all edges connected to the hovered node
    const connectedEdges = graphData.edges.filter(
      edge => edge.source === hoveredNode.id || edge.target === hoveredNode.id
    );
    
    // Calculate spatial distance for each connected edge
    const edgesWithDistance = connectedEdges.map(edge => {
      const otherNodeId = edge.source === hoveredNode.id ? edge.target : edge.source;
      const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
      
      if (!otherNode) return { edge, distance: Infinity };
      
      // Euclidean distance between hovered node and connected node
      const dx = otherNode.x - hoveredNode.x;
      const dy = otherNode.y - hoveredNode.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      return { edge, distance };
    });
    
    // Sort by distance (closest first) and take top 20
    return edgesWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20)
      .map(item => item.edge);
  }, [hoveredNode, graphData]);

  /**
   * Search and highlight nodes
   */
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !graphData) {
      setHighlightedNodes(new Set());
      return;
    }

    const matchingNodes = new Set<string>();
    const lowerQuery = query.toLowerCase();

    graphData.nodes.forEach(node => {
      if (
        node.title.toLowerCase().includes(lowerQuery) ||
        node.document_type.toLowerCase().includes(lowerQuery) ||
        node.metadata.document_number.toLowerCase().includes(lowerQuery)
      ) {
        matchingNodes.add(node.id);
      }
    });

    setHighlightedNodes(matchingNodes);

    // Select first matching node to zoom to it
    if (matchingNodes.size > 0) {
      const firstMatch = graphData.nodes.find(n => matchingNodes.has(n.id));
      if (firstMatch) {
        setSelectedNode(firstMatch);
      }
    }
  }, [graphData]);

  /**
   * Export graph as PNG
   */
  const exportToPNG = useCallback(() => {
    const plotElement = document.querySelector('.js-plotly-plot') as HTMLElement;
    if (!plotElement) return;

    // Use Plotly's built-in export functionality
    import('plotly.js-dist').then((Plotly) => {
      Plotly.downloadImage(plotElement, {
        format: 'png',
        width: 1920,
        height: 1080,
        filename: 'document-similarity-graph'
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
   * Prepare Plotly data
   */
  const plotData = useMemo(() => {
    if (!graphData) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: any[] = [];

    // Base layer: all document nodes
    const baseNodes = {
      x: graphData.nodes.map(n => n.x),
      y: graphData.nodes.map(n => n.y),
      mode: 'markers',
      type: 'scatter',
      name: 'Documents',
      marker: {
        size: 12,
        color: graphData.nodes.map(n => getNodeColor(n)),
        opacity: graphData.nodes.map(n => {
          // Dim non-highlighted nodes when search is active
          if (highlightedNodes.size > 0 && !highlightedNodes.has(n.id)) {
            return 0.2;
          }
          // Dim non-connected nodes when hovering
          if (hoveredNode && n.id !== hoveredNode.id) {
            const isConnected = getHoveredEdges.some(
              edge => edge.source === n.id || edge.target === n.id
            );
            return isConnected ? 0.8 : 0.2;
          }
          return 0.8;
        }),
        line: {
          width: graphData.nodes.map(n => {
            if (selectedNode?.id === n.id) return 3;
            if (hoveredNode?.id === n.id) return 2;
            return 0;
          }),
          color: '#000',
        }
      },
      text: graphData.nodes.map(n =>
        `<b>${n.title}</b><br>` +
        `Type: ${n.document_type.replace(/_/g, ' ')}<br>` +
        `${n.year ? `Year: ${n.year}<br>` : ''}` +
        `${n.metadata.court_name ? `Court: ${n.metadata.court_name}` : ''}`
      ),
      hoverinfo: 'text',
      customdata: graphData.nodes.map(n => n.id),
      showlegend: false,
    };

    traces.push(baseNodes);

    // Hover layer: similarity edges when hovering over a node
    if (hoveredNode && getHoveredEdges.length > 0) {
      const edgeX: (number | null)[] = [];
      const edgeY: (number | null)[] = [];
      const edgeColors: string[] = [];
      const edgeWidths: number[] = [];

      getHoveredEdges.forEach(edge => {
        const sourceNode = graphData.nodes.find(n => n.id === edge.source);
        const targetNode = graphData.nodes.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
          edgeX.push(sourceNode.x, targetNode.x, null);
          edgeY.push(sourceNode.y, targetNode.y, null);

          // Line opacity based on similarity score
          const opacity = 0.3 + edge.similarity * 0.4; // Range: 0.3 to 0.7
          edgeColors.push(`rgba(100, 116, 139, ${opacity})`); // Neutral slate color
          edgeWidths.push(1 + edge.similarity * 2);
        }
      });

      traces.push({
        x: edgeX,
        y: edgeY,
        mode: 'lines',
        type: 'scatter',
        name: 'Similarity',
        line: {
          width: 2,
          color: 'rgba(100, 116, 139, 0.4)', // Neutral slate color
        },
        hoverinfo: 'skip',
        showlegend: false,
      });
    }

    return traces;
  }, [graphData, hoveredNode, selectedNode, highlightedNodes, getHoveredEdges, getNodeColor]);

  /**
   * Plotly layout configuration
   */
  const plotLayout = useMemo(() => ({
    title: {
      text: '',
      font: { size: 16 }
    },
    xaxis: {
      title: '',
      showgrid: false,
      zeroline: false,
      showticklabels: false,
    },
    yaxis: {
      title: '',
      showgrid: false,
      zeroline: false,
      showticklabels: false,
    },
    hovermode: 'closest',
    showlegend: false,
    margin: { l: 20, r: 20, t: 20, b: 20 },
    plot_bgcolor: '#f9fafb',
    paper_bgcolor: '#ffffff',
  }), []);

  /**
   * Plotly config
   */
  const plotConfig = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    toImageButtonOptions: {
      format: 'png',
      filename: 'document-similarity-graph',
      height: 1080,
      width: 1920,
      scale: 2
    }
  }), []);

  /**
   * Handle plot click
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePlotClick = useCallback((data: any) => {
    if (data.points && data.points.length > 0) {
      const point = data.points[0];
      const nodeId = point.customdata;
      const node = graphData?.nodes.find(n => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
      }
    }
  }, [graphData]);

  /**
   * Handle plot hover
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePlotHover = useCallback((data: any) => {
    if (data.points && data.points.length > 0) {
      const point = data.points[0];
      const nodeId = point.customdata;
      const node = graphData?.nodes.find(n => n.id === nodeId);
      if (node) {
        setHoveredNode(node);
      }
    }
  }, [graphData]);

  /**
   * Handle plot unhover
   */
  const handlePlotUnhover = useCallback(() => {
    setHoveredNode(null);
  }, []);

  // Don't show full-screen loading - always show UI structure with progressive loading

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className={`${className} container mx-auto px-6 py-8 max-w-2xl`}>
        <ErrorCard
          title="Error Loading Graph"
          message={error}
          onRetry={fetchGraphData}
          retryLabel="Retry"
        />
      </div>
    );
  }

  /**
   * Render empty state - only show if loading is complete and there's actually no data
   */
  if (!loading && !loadingPlot && graphData && (!graphData.nodes || graphData.nodes.length === 0)) {
    return (
      <div className={className}>
        <EmptyState
          icon={Network}
          title="No documents found"
          description="No similar documents were found matching your current filters. Try adjusting the sample size or document type filters."
          primaryAction={{
            label: "Reload with Default Settings",
            onClick: () => {
              setControls({
                sampleSize: 500,
                similarityThreshold: 0.7,
                selectedDocumentTypes: [],
                enableClustering: false,
                layoutAlgorithm: 'force-directed',
              });
              fetchGraphData();
            },
            icon: RefreshCw,
          }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Description with typing animation */}
      <div className="mb-6">
        <TypingText
          text="Explore document similarity in an interactive network visualization. Hover over documents to highlight their connections."
          className="text-sm md:text-base text-muted-foreground"
        />
      </div>

      {/* Content area with loading overlay */}
      <div className="relative" ref={(el) => {
        if (isFirstLoad && loadingPlot && el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }}>
        {/* Loading overlay - only on first load */}
        {isFirstLoad && loadingPlot && (
          <div className="flex items-center justify-center min-h-[600px] glass-card glass-card--tile rounded-2xl p-8">
            <LoadingIndicator
              message="Loading graph visualization"
              subtitle="Preparing network layout and connections"
              variant="centered"
              size="lg"
              transparentBackground={true}
            />
          </div>
        )}

        {/* Statistics Bar - don't show on first load */}
        {!(isFirstLoad && loadingPlot) && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {loadingStats ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <BaseCard 
                key={i} 
                clickable={false} 
                variant="light"
                skeleton 
                className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex items-center justify-center" 
              />
            ))}
          </>
        ) : graphData?.statistics ? (
          <>
            <BaseCard clickable={false} variant="light" className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Documents</div>
              <div className="text-2xl font-bold text-primary">{graphData.statistics.total_nodes}</div>
            </BaseCard>
            <BaseCard clickable={false} variant="light" className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Avg Similarity</div>
              <div className="text-2xl font-bold text-purple-600">
                {(graphData.statistics.avg_similarity * 100).toFixed(1)}%
              </div>
            </BaseCard>
            <BaseCard clickable={false} variant="light" className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Min Similarity</div>
              <div className="text-2xl font-bold text-orange-600">
                {(graphData.statistics.min_similarity * 100).toFixed(1)}%
              </div>
            </BaseCard>
            <BaseCard clickable={false} variant="light" className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Max Similarity</div>
              <div className="text-2xl font-bold text-red-600">
                {(graphData.statistics.max_similarity * 100).toFixed(1)}%
              </div>
            </BaseCard>
            {graphData.statistics.num_clusters !== null && (
              <BaseCard clickable={false} variant="light" className="rounded-2xl -m-1.5 p-6 min-h-[80px] flex flex-col justify-center">
                <div className="text-sm text-muted-foreground mb-1">Clusters</div>
                <div className="text-2xl font-bold text-indigo-600">{graphData.statistics.num_clusters}</div>
              </BaseCard>
            )}
          </>
        ) : null}
          </div>
        )}

        {/* Main content - don't show on first load */}
        {!(isFirstLoad && loadingPlot) && (
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Main Graph Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Search and Controls Bar */}
              <BaseCard 
            variant="light"
            clickable={false}
            className="rounded-b-none border-b-0 -m-1.5 p-6" 
          >
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
              {/* Search */}
              <div className="flex-1 min-w-0">
                {loading || !graphData ? (
                  <Skeleton className="h-10 w-full rounded-lg" />
                ) : (
                  <SearchInput
                    type="text"
                    placeholder="Search documents by title, type, or number..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    size="md"
                    variant="transparent"
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-shrink-0 items-center">
                {loading || !graphData ? (
                  <>
                    <Skeleton className="h-10 w-32 rounded-lg" />
                    <Skeleton className="h-10 w-20 rounded-lg" />
                    <Skeleton className="h-10 w-24 rounded-lg" />
                  </>
                ) : (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleButton
                          isActive={showControls}
                          onClick={() => setShowControls(!showControls)}
                          icon={Filter}
                          size="sm"
                        >
                          {showControls ? 'Hide' : 'Show'} Controls
                        </ToggleButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        Toggle filter controls panel
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleButton
                          isActive={showInstructions}
                          onClick={() => setShowInstructions(!showInstructions)}
                          icon={Info}
                          size="sm"
                        >
                          Help
                        </ToggleButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        View usage instructions
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SecondaryButton
                          onClick={exportToPNG}
                          icon={Download}
                          size="sm"
                        >
                          Export
                        </SecondaryButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        Export graph as PNG image
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </BaseCard>

          {/* Instructions Panel */}
          {showInstructions && (
            <BaseCard clickable={false} variant="light" className="rounded-none border-x border-b -m-1.5 p-6">
              <div className="p-5 md:p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" />
                    How to Use
                  </h3>
                  <IconButton
                    icon={X}
                    onClick={() => setShowInstructions(false)}
                    size="sm"
                    aria-label="Close instructions"
                    compact
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <p><strong>Hover</strong> over a document to highlight similar documents.</p>
                  <p><strong>Click</strong> on a document to view detailed information in the side panel.</p>
                  <p><strong>Search</strong> to find specific documents - matching documents will be highlighted.</p>
                  <p><strong>Zoom and Pan</strong> using your mouse wheel and drag to explore the network.</p>
                  <p><strong>Colors</strong> represent different document types or clusters (when enabled).</p>
                </div>
              </div>
            </BaseCard>
          )}

          {/* Controls Panel */}
          {showControls && (
            <BaseCard
              variant="light"
              clickable={false}
              className="rounded-none border-x border-b -m-1.5 p-6"
            >
              <div className="space-y-4">
                {/* Sample Size */}
                {loadingConfig ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-6 w-full rounded-full" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>50</span>
                      <span>1000</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Sample Size</Label>
                      <Badge variant="secondary" className="text-xs font-medium">
                        {controls.sampleSize} docs
                      </Badge>
                    </div>
                    <Slider
                      value={[sliderValue]}
                      onValueChange={(value) => setSliderValue(value[0])}
                      min={50}
                      max={500}
                      step={50}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>50</span>
                      <span>500</span>
                    </div>
                  </div>
                )}

                {!loadingConfig && <Separator />}

                {/* Document Type Filters */}
                <div className="space-y-2">
                  {loadingConfig ? (
                    <>
                      <Skeleton className="h-4 w-32" />
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-2 rounded-lg border border-border"
                          >
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-3 w-3 rounded-full" />
                            <Skeleton className="h-4 w-20 flex-1" />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <Label className="text-sm font-semibold">Document Types</Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {availableDocumentTypes.map(type => {
                          const isSelected = controls.selectedDocumentTypes.length === 0 || controls.selectedDocumentTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleDocumentType(type)}
                              className={`neo-chip ${isSelected ? 'neo-chip--active' : ''} flex items-center gap-2 p-2 text-left`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDocumentType(type)}
                                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                              <span
                                className="w-3 h-3 rounded-full border-2 border-border flex-shrink-0"
                                style={{ backgroundColor: DOCUMENT_TYPE_COLORS[type] || DEFAULT_COLOR }}
                              />
                              <Label className="text-xs cursor-pointer flex-1 leading-tight">
                                {type.replace(/_/g, ' ')}
                              </Label>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {!loadingConfig && (
                  <>
                    <Separator />

                    {/* Clustering Toggle */}
                    <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-background/50">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={controls.enableClustering}
                          onCheckedChange={(checked) => setControls(prev => ({ ...prev, enableClustering: checked }))}
                        />
                        <div className="flex flex-col">
                          <Label className="text-sm font-semibold cursor-pointer">Enable Clustering</Label>
                          <span className="text-xs text-muted-foreground">Color by cluster groups</span>
                        </div>
                      </div>
                    </div>

                    {/* Apply Changes Button */}
                    <div className="flex justify-end pt-1">
                      <PrimaryButton
                        onClick={fetchGraphData}
                        icon={RefreshCw}
                        size="sm"
                      >
                        Apply Changes
                      </PrimaryButton>
                    </div>
                  </>
                )}
              </div>
            </BaseCard>
          )}

          {/* Graph Canvas */}
          <div className="rounded-t-none overflow-hidden relative bg-background border border-slate-200/50 dark:border-slate-800/50">
            {!isFirstLoad && loadingPlot ? (
              <div className="h-[500px] sm:h-[600px] md:h-[700px] xl:h-[800px] 2xl:h-[1000px] flex items-center justify-center glass-card glass-card--tile rounded-2xl m-4 p-8">
                <LoadingIndicator
                  message="Rerendering Visualization"
                  subtitle="Applying your filters and settings"
                  variant="centered"
                  size="md"
                  transparentBackground={true}
                />
              </div>
            ) : !graphData?.nodes || graphData.nodes.length === 0 ? (
              <div className="h-[500px] sm:h-[600px] md:h-[700px] xl:h-[800px] 2xl:h-[1000px] flex items-center justify-center glass-card glass-card--tile rounded-2xl m-4">
                <EmptyState
                  icon={Network}
                  title="No documents found"
                  description="No similar documents were found matching your current filters."
                />
              </div>
            ) : (
              <div className="h-[500px] sm:h-[600px] md:h-[700px] xl:h-[800px] 2xl:h-[1000px]">
                <Plot
                  data={plotData}
                  layout={plotLayout}
                  config={plotConfig}
                  onClick={handlePlotClick}
                  onHover={handlePlotHover}
                  onUnhover={handlePlotUnhover}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                />
              </div>
            )}

            {/* Legend - only show when plot is loaded and has data */}
            {availableDocumentTypes.length > 0 && (
              <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 max-w-[220px] sm:max-w-sm pointer-events-none">
                <div className="glass-card glass-card--tile rounded-2xl p-4">
                  <h4 className="text-base font-semibold mb-3 text-black dark:text-foreground">Legend</h4>
                  <div className="space-y-2 text-sm font-medium">
                    {availableDocumentTypes.map(type => (
                      <div key={type} className="flex items-center gap-2 capitalize text-black dark:text-foreground">
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: DOCUMENT_TYPE_COLORS[type] || DEFAULT_COLOR }}
                        />
                        <span>{type.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Details Side Panel */}
        {selectedNode && (
          <BaseCard
            clickable={false}
            variant="light"
            className="rounded-2xl shadow-lg overflow-hidden flex flex-col relative w-full lg:w-auto -m-1.5"
            style={{ width: `${panelWidth}px`, maxHeight: '600px' }}
          >
            {/* Resize Handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10 group"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* Header */}
            <div className="pb-3 bg-muted/30 p-4 border-b">
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-lg font-semibold flex-1 pr-2 line-clamp-2">
                  {selectedNode.title}
                </h3>
                <IconButton
                  icon={X}
                  onClick={() => setSelectedNode(null)}
                  size="sm"
                  aria-label="Close panel"
                  compact
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Metadata */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Document Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="secondary">{selectedNode.document_type.replace(/_/g, ' ')}</Badge>
                  </div>
                  {selectedNode.year && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Year:</span>
                      <span className="font-medium">{selectedNode.year}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Document #:</span>
                    <span className="font-medium text-xs">{selectedNode.metadata.document_number}</span>
                  </div>
                  {selectedNode.metadata.date_issued && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="font-medium text-xs">{selectedNode.metadata.date_issued}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Language:</span>
                    <Badge variant="outline">{selectedNode.metadata.language.toUpperCase()}</Badge>
                  </div>
                  {selectedNode.metadata.court_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Court:</span>
                      <span className="font-medium text-xs">{selectedNode.metadata.court_name}</span>
                    </div>
                  )}
                  {selectedNode.cluster_id !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cluster:</span>
                      <Badge variant="outline">#{selectedNode.cluster_id}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Similar Documents */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Similar Documents</h4>
                {getSimilarDocuments().length > 0 ? (
                  <div className="space-y-2">
                    {getSimilarDocuments().map((doc) => (
                      <BaseCard
                        key={doc.id}
                        clickable={true}
                        variant="light"
                        onClick={() => {
                          const node = graphData?.nodes.find(n => n.id === doc.id);
                          if (node) setSelectedNode(node);
                        }}
                        className="rounded-xl -m-1.5 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium line-clamp-2">
                              {doc.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {doc.document_type.replace(/_/g, ' ')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <Badge variant="default" className="text-xs">
                              {(doc.similarity * 100).toFixed(0)}%
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">similar</div>
                          </div>
                        </div>
                      </BaseCard>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No similar documents found</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-muted/30">
              <PrimaryButton
                onClick={() => {
                  window.open(`/documents/${selectedNode.id}`, '_blank');
                }}
                icon={FileText}
                className="w-full"
              >
                View Full Document
              </PrimaryButton>
            </div>
          </BaseCard>
        )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentVisualization;
