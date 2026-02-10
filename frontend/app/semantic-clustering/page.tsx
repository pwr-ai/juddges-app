'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Sparkles,
  Loader2,
  FileText,
  BarChart3,
  Layers,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import {
  PageContainer,
  BaseCard,
  Badge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Button,
  Breadcrumb,
} from '@/lib/styles/components';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import type {
  SemanticClusteringResponse,
  SemanticCluster,
  ClusterNode,
} from '@/lib/api';

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

// Cluster color palette - distinct, accessible colors
const CLUSTER_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
  '#84cc16', // lime
  '#a855f7', // purple
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#22c55e', // green
  '#eab308', // yellow
  '#64748b', // slate
  '#fb923c', // orange-light
  '#2dd4bf', // teal-light
];

// ===== Components =====

function StatsCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </div>
    </BaseCard>
  );
}

function ClusterCard({
  cluster,
  color,
  isExpanded,
  onToggle,
  onViewDocument,
}: {
  cluster: SemanticCluster;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
  onViewDocument: (documentId: string) => void;
}) {
  const coherencePercent = Math.round(cluster.coherence_score * 100);

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="space-y-3">
        {/* Header */}
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={onToggle}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div>
              <div className="font-semibold text-foreground">
                Cluster {cluster.cluster_id + 1}
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.size} documents · {coherencePercent}% coherence
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1 max-w-[300px]">
              {cluster.keywords.slice(0, 3).map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* All keywords */}
        {isExpanded && cluster.keywords.length > 3 && (
          <div className="flex flex-wrap gap-1">
            {cluster.keywords.map((kw) => (
              <Badge key={kw} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        )}

        {/* Document list */}
        {isExpanded && (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {cluster.documents.map((doc) => (
              <div
                key={doc.document_id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onViewDocument(doc.document_id)}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {doc.title || doc.document_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {doc.document_id}
                      {doc.date_issued && ` · ${doc.date_issued}`}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-mono text-muted-foreground flex-shrink-0 ml-2">
                  {Math.round(doc.similarity_to_centroid * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BaseCard>
  );
}

// ===== Main Page =====

export default function SemanticClusteringPage() {
  const router = useRouter();
  const [result, setResult] = useState<SemanticClusteringResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState(100);
  const [numClusters, setNumClusters] = useState(5);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(
    new Set()
  );
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);

  const handleCluster = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setExpandedClusters(new Set());
    setSelectedCluster(null);

    try {
      const response = await fetch('/api/clustering/semantic-clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sample_size: sampleSize,
          num_clusters: numClusters,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Clustering failed with status ${response.status}`
        );
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to generate clusters'
      );
    } finally {
      setIsLoading(false);
    }
  }, [sampleSize, numClusters]);

  const handleViewDocument = useCallback(
    (documentId: string) => {
      router.push(`/documents/${cleanDocumentIdForUrl(documentId)}`);
    },
    [router]
  );

  const toggleCluster = useCallback((clusterId: number) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  // Build Plotly data for cluster visualization
  const plotData = useMemo(() => {
    if (!result) return [];

    // Group nodes by cluster
    const clusterGroups: Record<number, ClusterNode[]> = {};
    for (const node of result.nodes) {
      if (!clusterGroups[node.cluster_id]) {
        clusterGroups[node.cluster_id] = [];
      }
      clusterGroups[node.cluster_id].push(node);
    }

    // Create a trace per cluster
    return Object.entries(clusterGroups).map(([clusterId, nodes]) => {
      const cid = parseInt(clusterId);
      const color = CLUSTER_COLORS[cid % CLUSTER_COLORS.length];
      const cluster = result.clusters.find((c) => c.cluster_id === cid);
      const keywords = cluster?.keywords.join(', ') || '';

      const isHighlighted = selectedCluster === null || selectedCluster === cid;

      return {
        x: nodes.map((n) => n.x),
        y: nodes.map((n) => n.y),
        text: nodes.map(
          (n) =>
            `<b>${n.title}</b><br>` +
            `Type: ${n.document_type}<br>` +
            `Year: ${n.year || 'N/A'}<br>` +
            `Cluster ${cid + 1}: ${keywords}`
        ),
        customdata: nodes.map((n) => n.id),
        mode: 'markers' as const,
        type: 'scatter' as const,
        name: `Cluster ${cid + 1}${keywords ? ': ' + keywords.substring(0, 30) : ''}`,
        marker: {
          size: 10,
          color: color,
          opacity: isHighlighted ? 0.85 : 0.15,
          line: {
            color: 'rgba(255,255,255,0.8)',
            width: 1,
          },
        },
        hoverinfo: 'text' as const,
      };
    });
  }, [result, selectedCluster]);

  const plotLayout = useMemo(
    () => ({
      autosize: true,
      height: 500,
      margin: { l: 40, r: 20, t: 30, b: 40 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      xaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: '',
      },
      yaxis: {
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        title: '',
      },
      showlegend: true,
      legend: {
        x: 1,
        y: 1,
        xanchor: 'right' as const,
        font: { size: 11 },
      },
      hovermode: 'closest' as const,
      dragmode: 'pan' as const,
    }),
    []
  );

  return (
    <PageContainer width="wide">
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Analysis', href: '/document-vis' },
            { label: 'Semantic Clustering' },
          ]}
          className="mb-2"
        />

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Semantic Clustering
              </h1>
              <p className="text-sm text-muted-foreground">
                Automatically cluster similar documents using embeddings and
                topic modeling. Explore thematic groups in your document
                collection.
              </p>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <BaseCard clickable={false} variant="light" className="rounded-[16px]">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Clustering Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Number of Clusters
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="1"
                    value={numClusters}
                    onChange={(e) => setNumClusters(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-sm font-mono font-medium text-foreground w-8 text-right">
                    {numClusters}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  More clusters create finer-grained topic groups. Fewer clusters give broader themes.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Documents to Analyze
                </label>
                <select
                  value={sampleSize}
                  onChange={(e) => setSampleSize(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                >
                  <option value="50">50 documents</option>
                  <option value="100">100 documents</option>
                  <option value="200">200 documents</option>
                  <option value="300">300 documents</option>
                  <option value="500">500 documents</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  More documents improve topic coverage but take longer to process.
                </p>
              </div>
            </div>

            <Button
              onClick={handleCluster}
              disabled={isLoading}
              className="w-full md:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clustering...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Clusters
                </>
              )}
            </Button>
          </div>
        </BaseCard>

        {/* Error */}
        {error && <ErrorCard title="Clustering Error" message={error} />}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <LoadingIndicator
              size="lg"
              message="Clustering documents by semantic similarity..."
              variant="centered"
            />
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-6">
            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatsCard
                label="Documents Clustered"
                value={result.statistics.total_documents}
                icon={FileText}
              />
              <StatsCard
                label="Clusters"
                value={result.statistics.num_clusters}
                icon={Layers}
              />
              <StatsCard
                label="Avg Coherence"
                value={`${Math.round(result.statistics.avg_coherence * 100)}%`}
                icon={BarChart3}
              />
              <StatsCard
                label="Clustering Time"
                value={`${Math.round(result.statistics.clustering_time_ms)}ms`}
                icon={Clock}
              />
            </div>

            {/* Visualization */}
            <BaseCard
              clickable={false}
              variant="light"
              className="rounded-[16px]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">
                    Cluster Visualization
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Each dot is a document, colored by cluster. Click a cluster
                    below to highlight it.
                  </p>
                </div>
                <div className="w-full" style={{ minHeight: 500 }}>
                  <Plot
                    data={plotData}
                    layout={plotLayout}
                    config={{
                      responsive: true,
                      displayModeBar: true,
                      modeBarButtonsToRemove: [
                        'lasso2d',
                        'select2d',
                        'autoScale2d',
                      ],
                      displaylogo: false,
                    }}
                    style={{ width: '100%', height: '100%' }}
                    onClick={(event: { points?: Array<{ customdata?: string }> }) => {
                      const point = event.points?.[0];
                      if (point?.customdata) {
                        handleViewDocument(point.customdata as string);
                      }
                    }}
                  />
                </div>
              </div>
            </BaseCard>

            {/* Cluster List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  Topic Clusters
                </h2>
                {selectedCluster !== null && (
                  <button
                    onClick={() => setSelectedCluster(null)}
                    className="text-xs text-primary hover:underline"
                  >
                    Show all clusters
                  </button>
                )}
              </div>
              {result.clusters
                .sort((a, b) => b.size - a.size)
                .map((cluster) => (
                  <div
                    key={cluster.cluster_id}
                    onMouseEnter={() =>
                      setSelectedCluster(cluster.cluster_id)
                    }
                    onMouseLeave={() => setSelectedCluster(null)}
                  >
                    <ClusterCard
                      cluster={cluster}
                      color={
                        CLUSTER_COLORS[
                          cluster.cluster_id % CLUSTER_COLORS.length
                        ]
                      }
                      isExpanded={expandedClusters.has(cluster.cluster_id)}
                      onToggle={() => toggleCluster(cluster.cluster_id)}
                      onViewDocument={handleViewDocument}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Initial empty state */}
        {!result && !isLoading && !error && (
          <EmptyState
            icon={Sparkles}
            title="Ready to Cluster"
            description="Configure the parameters above and click 'Generate Clusters' to automatically discover thematic groups in your document collection using semantic embeddings."
          />
        )}
      </div>
    </PageContainer>
  );
}
