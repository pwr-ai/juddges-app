'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  GitBranch,
  Search,
  Scale,
  Calendar,
  Hash,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart3,
  ExternalLink,
  Save,
  BookMarked,
  CheckCircle,
  Loader2,
  Network,
  GitMerge,
  Activity,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PageContainer,
  AIDisclaimerBadge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Badge,
} from '@/lib/styles/components';
import {
  EditorialCard,
  Eyebrow,
  Headline,
  StatusBadge as EditorialStatusBadge,
} from '@/components/editorial';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  discoverReasoningLines,
  createReasoningLine,
  listReasoningLines,
  getReasoningLineDAG,
  detectEvents,
  searchReasoningLines,
} from '@/lib/api/reasoning-lines';
import type {
  DiscoveryResponse,
  DiscoveryParams,
  DiscoveredCluster,
  ReasoningLineSummary,
  CreateReasoningLineRequest,
  EventDetectionResult,
  SearchResult,
} from '@/types/reasoning-lines';
import Link from 'next/link';
import { ReasoningDAG } from '@/components/reasoning-lines/ReasoningDAG';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { logger } from '@/lib/logger';

/** Active tab on the reasoning lines page */
type TabId = 'discover' | 'saved' | 'dag';

/** Editorial semantic cluster styles: 6 distinct border/text styles */
const CLUSTER_COLORS = [
  'border border-rule text-ink bg-transparent',
  'border border-oxblood text-oxblood bg-transparent',
  'border border-gold text-gold bg-transparent',
  'border border-rule text-ink-soft bg-transparent border-dashed',
  'border border-oxblood text-oxblood bg-transparent border-dashed',
  'border border-gold text-gold bg-transparent border-dashed',
];

function getClusterColor(clusterIndex: number): string {
  return CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
}

/** Format coherence score as a percentage string */
function formatCoherence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Format date string to a short, locale-stable numeric format */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function ReasoningLinesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.is_admin === true;
  const [activeTab, setActiveTab] = useState<TabId>('discover');

  // Discovery form state
  const [sampleSize, setSampleSize] = useState<number>(200);
  const [numClusters, setNumClusters] = useState<number>(8);
  const [legalDomainFilter, setLegalDomainFilter] = useState<string>('');

  // Results and expanded clusters state
  const [results, setResults] = useState<DiscoveryResponse | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  // Track which clusters have been saved (cluster_id -> true)
  const [savedClusters, setSavedClusters] = useState<Set<number>>(new Set());

  // Event detection result (stored locally after POST)
  const [eventResult, setEventResult] = useState<EventDetectionResult | null>(null);

  const queryClient = useQueryClient();

  // Discovery mutation via React Query
  const discoveryMutation = useMutation({
    mutationFn: (params: DiscoveryParams) => discoverReasoningLines(params),
    onSuccess: (data) => {
      setResults(data);
      setExpandedClusters(new Set());
      setSavedClusters(new Set());
    },
    onError: (error) => {
      logger.error('Reasoning line discovery request failed', error);
    },
  });

  // Create reasoning line mutation
  const createMutation = useMutation({
    mutationFn: (params: CreateReasoningLineRequest) => createReasoningLine(params),
    onSuccess: (_data, variables) => {
      // Invalidate the saved lines query so it refreshes
      queryClient.invalidateQueries({ queryKey: ['reasoning-lines'] });
      // Find the cluster that was saved by matching the label
      const cluster = results?.clusters.find((c) => c.label === variables.label);
      if (cluster) {
        setSavedClusters((prev) => new Set(prev).add(cluster.cluster_id));
      }
    },
    onError: (error) => {
      logger.error('Saving a discovered cluster as a reasoning line failed', error);
    },
  });

  // Fetch saved reasoning lines (only when "saved" tab is active)
  const savedLinesQuery = useQuery({
    queryKey: ['reasoning-lines', 'active'],
    queryFn: () => listReasoningLines('active'),
    enabled: activeTab === 'saved',
  });

  // Fetch DAG data (only when "dag" tab is active)
  const dagQuery = useQuery({
    queryKey: ['reasoning-lines-dag'],
    queryFn: () => getReasoningLineDAG(),
    enabled: activeTab === 'dag',
  });

  // Detect events mutation
  const detectEventsMutation = useMutation({
    mutationFn: () => detectEvents(),
    onSuccess: (result) => {
      setEventResult(result);
      // Refetch DAG after events are detected
      queryClient.invalidateQueries({ queryKey: ['reasoning-lines-dag'] });
    },
    onError: (error) => {
      logger.error('Reasoning line event detection failed', error);
    },
  });

  const handleDiscover = useCallback(() => {
    const params: DiscoveryParams = {
      sample_size: sampleSize,
      num_clusters: numClusters,
      legal_domain_filter: legalDomainFilter.trim() || null,
      min_shared_legal_bases: 1,
    };
    discoveryMutation.mutate(params);
  }, [sampleSize, numClusters, legalDomainFilter, discoveryMutation]);

  const toggleClusterExpansion = useCallback((clusterId: number) => {
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

  /** Save a discovered cluster as a reasoning line */
  const handleSaveCluster = useCallback(
    (cluster: DiscoveredCluster) => {
      const request: CreateReasoningLineRequest = {
        label: cluster.label,
        legal_question: `Conditions related to: ${cluster.label}`,
        keywords: cluster.keywords,
        legal_bases: cluster.legal_bases,
        judgment_ids: cluster.top_cases.map((c) => c.judgment_id),
        coherence_score: cluster.coherence_score,
      };
      createMutation.mutate(request);
    },
    [createMutation]
  );

  const isLoading = discoveryMutation.isPending;
  const hasError = discoveryMutation.isError;

  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <header className="mb-6">
        <Eyebrow tone="oxblood" className="mb-2">
          Jurisprudence Analysis
        </Eyebrow>
        <Headline as="h1" size="md">
          {t('reasoningLines.pageTitle')}
        </Headline>
        <p className="mt-2 text-base text-ink-soft">
          {t('reasoningLines.pageSubtitle')}
        </p>
        <div className="mt-3">
          <AIDisclaimerBadge />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-rule mb-6">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px ${
            activeTab === 'discover'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
          aria-selected={activeTab === 'discover'}
          role="tab"
        >
          <Search className="h-3.5 w-3.5" />
          {t('reasoningLines.tabDiscover')}
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px ${
            activeTab === 'saved'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
          aria-selected={activeTab === 'saved'}
          role="tab"
        >
          <BookMarked className="h-3.5 w-3.5" />
          {t('reasoningLines.tabSaved')}
        </button>
        <button
          onClick={() => setActiveTab('dag')}
          className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors border-b-2 -mb-px ${
            activeTab === 'dag'
              ? 'border-ink text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
          aria-selected={activeTab === 'dag'}
          role="tab"
        >
          <Network className="h-3.5 w-3.5" />
          {t('reasoningLines.tabDag')}
        </button>
      </div>

      {/* ================================================================== */}
      {/* Discover tab                                                       */}
      {/* ================================================================== */}
      {activeTab === 'discover' && (
        <>
          {/* Discovery controls */}
          <EditorialCard flat className="p-5">
            <div className="space-y-5">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                {t('reasoningLines.paramsHeading')}
              </label>

              {/* Sample size slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {t('reasoningLines.paramSampleSize')}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {sampleSize}
                  </span>
                </div>
                <Slider
                  min={20}
                  max={500}
                  step={10}
                  value={[sampleSize]}
                  onValueChange={(value) => setSampleSize(value[0])}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>20</span>
                  <span>500</span>
                </div>
              </div>

              {/* Number of clusters slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {t('reasoningLines.paramNumClusters')}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {numClusters}
                  </span>
                </div>
                <Slider
                  min={2}
                  max={20}
                  step={1}
                  value={[numClusters]}
                  onValueChange={(value) => setNumClusters(value[0])}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>2</span>
                  <span>20</span>
                </div>
              </div>

              {/* Legal domain filter */}
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">
                  {t('reasoningLines.paramLegalDomain')}
                </span>
                <Input
                  placeholder={t('reasoningLines.paramLegalDomainPlaceholder')}
                  value={legalDomainFilter}
                  onChange={(e) => setLegalDomainFilter(e.target.value)}
                  className="bg-parchment rounded-none border-rule"
                />
              </div>

              {/* Discover button */}
              <Button
                onClick={handleDiscover}
                disabled={isLoading}
                className="w-full sm:w-auto flex items-center gap-2 rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep transition-colors"
              >
                <Search className="h-4 w-4" />
                {isLoading
                  ? t('reasoningLines.discoverButtonPending')
                  : t('reasoningLines.discoverButton')}
              </Button>
            </div>
          </EditorialCard>

          {/* Loading state */}
          {isLoading && (
            <LoadingIndicator
              variant="centered"
              size="lg"
              message={t('reasoningLines.discoverLoadingTitle')}
              subtitle={t('reasoningLines.discoverLoadingSubtitle')}
            />
          )}

          {/* Error state */}
          {hasError && !isLoading && (
            <ErrorCard
              title={t('reasoningLines.discoverErrorTitle')}
              message={t('reasoningLines.discoverErrorMessage')}
              onRetry={handleDiscover}
              retryLabel={t('common.retry')}
            />
          )}

          {/* Statistics bar */}
          {results && !isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={Hash}
                label={t('reasoningLines.statDocuments')}
                value={results.statistics.total_documents.toLocaleString('pl-PL')}
              />
              <StatCard
                icon={GitBranch}
                label={t('reasoningLines.statClusters')}
                value={results.statistics.num_clusters.toString()}
              />
              <StatCard
                icon={BarChart3}
                label={t('reasoningLines.statCoherence')}
                value={formatCoherence(results.statistics.avg_coherence)}
              />
              <StatCard
                icon={Clock}
                label={t('reasoningLines.statTime')}
                value={`${(results.statistics.processing_time_ms / 1000).toFixed(1)}s`}
              />
            </div>
          )}

          {/* Cluster results */}
          {results && !isLoading && results.clusters.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                {t('reasoningLines.discoveredHeading', { count: results.clusters.length })}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {results.clusters.map((cluster, index) => (
                  <ClusterCard
                    key={cluster.cluster_id}
                    cluster={cluster}
                    colorIndex={index}
                    isExpanded={expandedClusters.has(cluster.cluster_id)}
                    onToggleExpand={() => toggleClusterExpansion(cluster.cluster_id)}
                    onSave={isAdmin ? () => handleSaveCluster(cluster) : undefined}
                    isSaving={
                      createMutation.isPending &&
                      createMutation.variables?.label === cluster.label
                    }
                    isSaved={savedClusters.has(cluster.cluster_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state — shown before any search */}
          {!results && !isLoading && !hasError && (
            <div className="space-y-6">
              <EmptyState
                title={t('reasoningLines.discoverEmptyTitle')}
                description={t('reasoningLines.discoverEmptyDescription')}
                icon={GitBranch}
              />

              {/* How it works explanation */}
              <EditorialCard flat className="p-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold font-serif text-ink">
                    {t('reasoningLines.howItWorks')}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase tracking-wider text-oxblood">
                        {t('reasoningLines.howSemanticTitle')}
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {t('reasoningLines.howSemanticDescription')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase tracking-wider text-oxblood">
                        {t('reasoningLines.howSharedBasesTitle')}
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {t('reasoningLines.howSharedBasesDescription')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase tracking-wider text-oxblood">
                        {t('reasoningLines.howCoherenceTitle')}
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {t('reasoningLines.howCoherenceDescription')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono uppercase tracking-wider text-oxblood">
                        {t('reasoningLines.howKeywordsTitle')}
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {t('reasoningLines.howKeywordsDescription')}
                      </p>
                    </div>
                  </div>
                </div>
              </EditorialCard>
            </div>
          )}
        </>
      )}

      {/* ================================================================== */}
      {/* Saved Lines tab                                                    */}
      {/* ================================================================== */}
      {activeTab === 'saved' && (
        <SavedLinesTab
          query={savedLinesQuery}
        />
      )}

      {/* ================================================================== */}
      {/* DAG tab (M4)                                                       */}
      {/* ================================================================== */}
      {activeTab === 'dag' && (
        <DAGTab
          dagQuery={dagQuery}
          detectEventsMutation={detectEventsMutation}
          eventResult={eventResult}
          canDetectEvents={isAdmin}
        />
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Small statistics card shown in the stats bar */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <EditorialCard flat className="p-3">
      <div className="flex items-center gap-3">
        <div className="p-1.5 border border-rule bg-parchment-deep">
          <Icon className="h-4 w-4 text-oxblood" />
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">{label}</p>
          <p className="font-mono text-lg font-semibold text-ink tabular-nums">{value}</p>
        </div>
      </div>
    </EditorialCard>
  );
}

/** Card for a single discovered cluster, with save button */
function ClusterCard({
  cluster,
  colorIndex,
  isExpanded,
  onToggleExpand,
  onSave,
  isSaving,
  isSaved,
}: {
  cluster: DiscoveredCluster;
  colorIndex: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave?: () => void;
  isSaving: boolean;
  isSaved: boolean;
}) {
  const { t } = useTranslation();
  const colorClass = getClusterColor(colorIndex);

  return (
    <EditorialCard flat className="p-4">
      <div className="space-y-3">
        {/* Cluster header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="font-semibold text-base text-foreground truncate">
              {cluster.label}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {t('reasoningLines.clusterCaseCount', { count: cluster.case_count })}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(cluster.date_range.start)} - {formatDate(cluster.date_range.end)}
              </span>
            </div>
          </div>
          {/* Coherence indicator */}
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-muted-foreground">
              {t('reasoningLines.coherenceLabel')}
            </p>
            <CoherenceBadge score={cluster.coherence_score} />
          </div>
        </div>

        {/* Keywords */}
        <div className="flex flex-wrap gap-1.5">
          {cluster.keywords.map((keyword) => (
            <Badge
              key={keyword}
              variant="secondary"
              className={`text-xs ${colorClass}`}
            >
              {keyword}
            </Badge>
          ))}
        </div>

        {/* Legal bases */}
        {cluster.legal_bases.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3" />
              {t('reasoningLines.legalBasesLabel')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {cluster.legal_bases.map((base) => (
                <Badge key={base} variant="outline" className="text-xs">
                  {base}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action row: expand toggle + save button */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Expand toggle for top cases */}
          {cluster.top_cases.length > 0 ? (
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              aria-expanded={isExpanded}
              aria-controls={`cluster-cases-${cluster.cluster_id}`}
            >
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {isExpanded
                ? t('reasoningLines.hideCases')
                : t('reasoningLines.showCases', { count: cluster.top_cases.length })}
            </button>
          ) : (
            <div />
          )}

          {/* Saving discovered clusters mutates the global catalog and is admin-only. */}
          {onSave && (
            <Button
              variant={isSaved ? 'outline' : 'default'}
              size="sm"
              onClick={onSave}
              disabled={isSaving || isSaved}
              className="flex items-center gap-1.5 text-xs"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSaved ? (
                <CheckCircle className="h-3.5 w-3.5 text-ink" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isSaving
                ? t('reasoningLines.saveClusterPending')
                : isSaved
                  ? t('reasoningLines.saveClusterDone')
                  : t('reasoningLines.saveCluster')}
            </Button>
          )}
        </div>

        {/* Expanded cases list */}
        {isExpanded && cluster.top_cases.length > 0 && (
          <div
            id={`cluster-cases-${cluster.cluster_id}`}
            className="space-y-2"
          >
            {cluster.top_cases.map((caseItem) => (
              <Link
                key={caseItem.judgment_id}
                href={`/documents/${caseItem.judgment_id}`}
                className="block group/case"
              >
                <div className="flex items-start justify-between gap-3 p-3 rounded-none bg-parchment border border-rule hover:border-ink transition-colors">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground group-hover/case:text-primary transition-colors truncate">
                      {caseItem.signature}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {caseItem.court_name}
                      {caseItem.decision_date && ` | ${formatDate(caseItem.decision_date)}`}
                    </p>
                    {caseItem.title && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {caseItem.title}
                      </p>
                    )}
                    {caseItem.cited_legislation.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {caseItem.cited_legislation.slice(0, 3).map((leg) => (
                          <span
                            key={leg}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded-none bg-parchment-deep border border-rule text-ink-soft"
                          >
                            {leg}
                          </span>
                        ))}
                        {caseItem.cited_legislation.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{caseItem.cited_legislation.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(caseItem.similarity_to_centroid * 100)}%
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/case:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </EditorialCard>
  );
}

/** Small coherence score badge with semantic color coding */
function CoherenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const toneClass =
    pct >= 70
      ? 'text-ink'
      : pct >= 50
        ? 'text-gold'
        : 'text-oxblood';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-none text-xs font-mono border border-rule tabular-nums ${toneClass}`}
    >
      {pct}%
    </span>
  );
}

/** Status badge for a reasoning line */
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const labelMap: Record<string, string> = {
    active: t('reasoningLines.statusActive'),
    archived: t('reasoningLines.statusArchived'),
    deleted: t('reasoningLines.statusDeleted'),
  };

  return <EditorialStatusBadge status={status} label={labelMap[status] ?? status} />;
}

/** Saved Lines tab content — includes semantic search bar (M6) */
function SavedLinesTab({
  query,
}: {
  query: ReturnType<typeof useQuery<ReasoningLineSummary[]>>;
}) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchTerm]);

  // Only fire search when >= 3 chars
  const shouldSearch = debouncedTerm.trim().length >= 3;

  const searchQuery = useQuery({
    queryKey: ['reasoning-lines-search', debouncedTerm],
    queryFn: () => searchReasoningLines(debouncedTerm.trim()),
    enabled: shouldSearch,
  });

  // Keep the technical failure reason in the logs; the UI shows fixed, actionable copy.
  useEffect(() => {
    if (searchQuery.error) {
      logger.error('Reasoning line search request failed', searchQuery.error);
    }
  }, [searchQuery.error]);

  useEffect(() => {
    if (query.error) {
      logger.error('Loading the saved reasoning lines failed', query.error);
    }
  }, [query.error]);

  // Show search results when a search is active, otherwise show saved lines
  const isSearchActive = shouldSearch;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('reasoningLines.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 rounded-none border-rule bg-parchment font-mono text-sm focus-visible:border-ink"
          aria-label={t('reasoningLines.searchAriaLabel')}
        />
        {searchQuery.isFetching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Search results */}
      {isSearchActive && (
        <>
          {searchQuery.isError && (
            <ErrorCard
              title={t('reasoningLines.searchErrorTitle')}
              message={t('reasoningLines.searchErrorMessage')}
              onRetry={() => searchQuery.refetch()}
              retryLabel={t('common.retry')}
            />
          )}

          {searchQuery.data && searchQuery.data.results.length === 0 && (
            <EmptyState
              title={t('reasoningLines.searchEmptyTitle')}
              description={t('reasoningLines.searchEmptyDescription', { query: debouncedTerm })}
              icon={Search}
            />
          )}

          {searchQuery.data && searchQuery.data.results.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                {t('reasoningLines.searchResultsHeading', { count: searchQuery.data.total_found })}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {searchQuery.data.results.map((result, index) => (
                  <SearchResultCard key={result.id} result={result} colorIndex={index} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Regular saved lines (shown when search is empty) */}
      {!isSearchActive && (
        <>
          {query.isLoading && (
            <LoadingIndicator
              variant="centered"
              size="lg"
              message={t('reasoningLines.savedLoading')}
            />
          )}

          {query.isError && (
            <ErrorCard
              title={t('reasoningLines.savedErrorTitle')}
              message={t('reasoningLines.savedErrorMessage')}
              onRetry={() => query.refetch()}
              retryLabel={t('common.retry')}
            />
          )}

          {!query.isLoading && !query.isError && (query.data ?? []).length === 0 && (
            <EmptyState
              title={t('reasoningLines.savedEmptyTitle')}
              description={t('reasoningLines.savedEmptyDescription')}
              icon={BookMarked}
            />
          )}

          {!query.isLoading && !query.isError && (query.data ?? []).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                {t('reasoningLines.savedHeading', { count: (query.data ?? []).length })}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {(query.data ?? []).map((line, index) => (
                  <SavedLineCard key={line.id} line={line} colorIndex={index} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Pipeline status info card */}
      <EditorialCard flat className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-ink" />
            <h3 className="text-sm font-semibold font-serif text-ink">
              {t('reasoningLines.pipelineHeading')}
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 text-xs text-ink-soft">
            <div className="space-y-1">
              <div className="font-semibold text-ink">
                {t('reasoningLines.pipelineAssignTitle')}
              </div>
              <p>{t('reasoningLines.pipelineAssignDescription')}</p>
              <Badge variant="outline" className="text-[10px] rounded-none font-mono uppercase tracking-wider border-rule text-ink-soft">
                {t('reasoningLines.pipelineWeekly')}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-ink">
                {t('reasoningLines.pipelineDiscoverTitle')}
              </div>
              <p>{t('reasoningLines.pipelineDiscoverDescription')}</p>
              <Badge variant="outline" className="text-[10px] rounded-none font-mono uppercase tracking-wider border-rule text-ink-soft">
                {t('reasoningLines.pipelineWeekly')}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-ink">
                {t('reasoningLines.pipelineEventsTitle')}
              </div>
              <p>{t('reasoningLines.pipelineEventsDescription')}</p>
              <Badge variant="outline" className="text-[10px] rounded-none font-mono uppercase tracking-wider border-rule text-ink-soft">
                {t('reasoningLines.pipelineWeekly')}
              </Badge>
            </div>
          </div>
        </div>
      </EditorialCard>
    </div>
  );
}

/** Card for a search result — similar to SavedLineCard but with similarity badge */
function SearchResultCard({
  result,
  colorIndex,
}: {
  result: SearchResult;
  colorIndex: number;
}) {
  const { t } = useTranslation();
  const colorClass = getClusterColor(colorIndex);
  const similarityPct = Math.round(result.similarity * 100);

  return (
    <Link href={`/reasoning-lines/${result.id}`} className="block group">
      <EditorialCard flat className="p-4 group-hover:border-ink transition-colors">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-serif font-semibold text-base text-ink group-hover:text-oxblood transition-colors truncate">
                {result.label}
              </h3>
              {result.legal_question && (
                <p className="text-xs text-ink-soft line-clamp-2">
                  {result.legal_question}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              {/* Similarity badge */}
              <span className="inline-flex items-center px-2 py-0.5 rounded-none font-mono text-xs font-semibold tabular-nums border border-oxblood/30 bg-oxblood/5 text-oxblood">
                {t('reasoningLines.similarityMatch', { percent: similarityPct })}
              </span>
              <CoherenceBadge score={result.coherence_score} />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft font-mono">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {t('reasoningLines.caseCount', { count: result.case_count })}
            </span>
          </div>

          {/* Keywords */}
          <div className="flex flex-wrap gap-1.5">
            {result.keywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="secondary"
                className={`text-xs ${colorClass}`}
              >
                {keyword}
              </Badge>
            ))}
          </div>

          {/* Legal bases */}
          {result.legal_bases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.legal_bases.map((base) => (
                <Badge key={base} variant="outline" className="text-xs rounded-none font-mono border-rule text-ink-soft">
                  {base}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </EditorialCard>
    </Link>
  );
}

/** Card for a saved reasoning line in the list */
function SavedLineCard({
  line,
  colorIndex,
}: {
  line: ReasoningLineSummary;
  colorIndex: number;
}) {
  const { t } = useTranslation();
  const colorClass = getClusterColor(colorIndex);

  return (
    <Link href={`/reasoning-lines/${line.id}`} className="block group">
      <EditorialCard flat className="p-4 group-hover:border-ink transition-colors">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-serif font-semibold text-base text-ink group-hover:text-oxblood transition-colors truncate">
                {line.label}
              </h3>
              {line.legal_question && (
                <p className="text-xs text-ink-soft line-clamp-2">
                  {line.legal_question}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <StatusBadge status={line.status} />
              <CoherenceBadge score={line.coherence_score} />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft font-mono">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {t('reasoningLines.caseCount', { count: line.case_count })}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(line.date_range_start)} - {formatDate(line.date_range_end)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(line.created_at)}
            </span>
          </div>

          {/* Keywords */}
          <div className="flex flex-wrap gap-1.5">
            {line.keywords.map((keyword) => (
              <Badge
                key={keyword}
                variant="secondary"
                className={`text-xs ${colorClass}`}
              >
                {keyword}
              </Badge>
            ))}
          </div>

          {/* Legal bases */}
          {line.legal_bases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {line.legal_bases.map((base) => (
                <Badge key={base} variant="outline" className="text-xs rounded-none font-mono border-rule text-ink-soft">
                  {base}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </EditorialCard>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// DAG Tab (M4)
// ---------------------------------------------------------------------------

/** DAG tab content — graph visualization + event detection */
function DAGTab({
  dagQuery,
  detectEventsMutation,
  eventResult,
  canDetectEvents,
}: {
  dagQuery: ReturnType<typeof useQuery>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectEventsMutation: ReturnType<typeof useMutation<EventDetectionResult, Error, void, any>>;
  eventResult: EventDetectionResult | null;
  canDetectEvents: boolean;
}) {
  const { t } = useTranslation();

  // Keep the technical failure reason in the logs; the UI shows fixed, actionable copy.
  useEffect(() => {
    if (dagQuery.error) {
      logger.error('Loading the reasoning line DAG failed', dagQuery.error);
    }
  }, [dagQuery.error]);

  // Type-narrow the query data
  const dagData = dagQuery.data as
    | { nodes: import('@/types/reasoning-lines').DAGNode[]; edges: import('@/types/reasoning-lines').DAGEdge[]; statistics: import('@/types/reasoning-lines').DAGStatistics }
    | undefined;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          {t('reasoningLines.dagHeading')}
        </h2>
        {canDetectEvents && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => detectEventsMutation.mutate()}
            disabled={detectEventsMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-mono rounded-none border-rule"
          >
            <GitMerge className="h-3.5 w-3.5 text-oxblood" />
            {detectEventsMutation.isPending
              ? t('reasoningLines.detectEventsPending')
              : t('reasoningLines.detectEvents')}
          </Button>
        )}
      </div>

      {/* Event detection feedback */}
      {detectEventsMutation.isError && (
        <span className="text-xs font-mono text-oxblood">
          {t('reasoningLines.detectEventsError')}
        </span>
      )}
      {eventResult && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-oxblood">
            {t('reasoningLines.eventBranches', { count: eventResult.branches_detected })}
          </span>
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink">
            {t('reasoningLines.eventMerges', { count: eventResult.merges_detected })}
          </span>
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-gold">
            {t('reasoningLines.eventInfluences', { count: eventResult.influences_detected })}
          </span>
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
            {t('reasoningLines.eventLinesAnalyzed', { count: eventResult.lines_analyzed })}
          </span>
          <span className="px-2 py-0.5 rounded-none font-mono text-xs border border-rule bg-parchment-deep text-ink-soft">
            {t('reasoningLines.eventProcessingTime', {
              seconds: (eventResult.processing_time_ms / 1000).toFixed(1),
            })}
          </span>
        </div>
      )}

      {/* Loading */}
      {dagQuery.isLoading && (
        <LoadingIndicator
          variant="centered"
          size="lg"
          message={t('reasoningLines.dagLoading')}
        />
      )}

      {/* Error */}
      {dagQuery.isError && (
        <ErrorCard
          title={t('reasoningLines.dagErrorTitle')}
          message={t('reasoningLines.dagErrorMessage')}
          onRetry={() => dagQuery.refetch()}
          retryLabel={t('common.retry')}
        />
      )}

      {/* Empty state */}
      {dagData && dagData.nodes.length === 0 && (
        <EmptyState
          title={t('reasoningLines.dagEmptyTitle')}
          description={
            canDetectEvents
              ? t('reasoningLines.dagEmptyDescriptionAdmin')
              : t('reasoningLines.dagEmptyDescription')
          }
          icon={Network}
        />
      )}

      {/* Graph */}
      {dagData && dagData.nodes.length > 0 && (
        <ReasoningDAG
          nodes={dagData.nodes}
          edges={dagData.edges}
          height={500}
        />
      )}

      {/* Statistics below graph */}
      {dagData && dagData.statistics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Network}
            label={t('reasoningLines.statNodes')}
            value={dagData.statistics.total_nodes.toString()}
          />
          <StatCard
            icon={GitBranch}
            label={t('reasoningLines.statEdges')}
            value={dagData.statistics.total_edges.toString()}
          />
          {eventResult && (
            <>
              <StatCard
                icon={GitBranch}
                label={t('reasoningLines.statBranches')}
                value={eventResult.branches_detected.toString()}
              />
              <StatCard
                icon={GitMerge}
                label={t('reasoningLines.statMerges')}
                value={eventResult.merges_detected.toString()}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
