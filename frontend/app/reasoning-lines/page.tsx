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
  Zap,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PageContainer,
  BaseCard,
  AIDisclaimerBadge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Badge,
} from '@/lib/styles/components';
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

/** Active tab on the reasoning lines page */
type TabId = 'discover' | 'saved' | 'dag';

/** Color palette for cluster badges and indicators */
const CLUSTER_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-purple-100 text-purple-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
  'bg-lime-100 text-lime-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-teal-100 text-teal-800',
  'bg-red-100 text-red-800',
  'bg-sky-100 text-sky-800',
  'bg-yellow-100 text-yellow-800',
  'bg-violet-100 text-violet-800',
  'bg-pink-100 text-pink-800',
  'bg-green-100 text-green-800',
  'bg-stone-100 text-stone-800',
  'bg-slate-100 text-slate-800',
  'bg-zinc-100 text-zinc-800',
];

function getClusterColor(clusterIndex: number): string {
  return CLUSTER_COLORS[clusterIndex % CLUSTER_COLORS.length];
}

/** Format coherence score as a percentage string */
function formatCoherence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Format date string to a shorter Polish-friendly format */
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
  const errorMessage = discoveryMutation.error?.message ?? 'Nieznany blad';

  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Linie orzecznicze
            </h1>
            <p className="text-sm text-muted-foreground">
              Odkryj klastry orzeczen dotyczacych tych samych zagadnien prawnych
            </p>
          </div>
        </div>
        <AIDisclaimerBadge />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit">
        <button
          onClick={() => setActiveTab('discover')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'discover'
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-selected={activeTab === 'discover'}
          role="tab"
        >
          <Search className="h-4 w-4" />
          Odkryj
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'saved'
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-selected={activeTab === 'saved'}
          role="tab"
        >
          <BookMarked className="h-4 w-4" />
          Zapisane linie
        </button>
        <button
          onClick={() => setActiveTab('dag')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'dag'
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-selected={activeTab === 'dag'}
          role="tab"
        >
          <Network className="h-4 w-4" />
          Graf DAG
        </button>
      </div>

      {/* ================================================================== */}
      {/* Discover tab                                                       */}
      {/* ================================================================== */}
      {activeTab === 'discover' && (
        <>
          {/* Discovery controls */}
          <BaseCard clickable={false} variant="light" className="rounded-[16px]">
            <div className="space-y-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Parametry odkrywania
              </label>

              {/* Sample size slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Rozmiar probki
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
                    Liczba klastrow
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
                  Dziedzina prawa (opcjonalnie)
                </span>
                <Input
                  placeholder="np. prawo podatkowe, prawo pracy..."
                  value={legalDomainFilter}
                  onChange={(e) => setLegalDomainFilter(e.target.value)}
                  className="bg-white/50"
                />
              </div>

              {/* Discover button */}
              <Button
                onClick={handleDiscover}
                disabled={isLoading}
                className="w-full sm:w-auto flex items-center gap-2"
              >
                <Search className="h-4 w-4" />
                {isLoading ? 'Odkrywanie...' : 'Odkryj linie'}
              </Button>
            </div>
          </BaseCard>

          {/* Loading state */}
          {isLoading && (
            <LoadingIndicator
              variant="centered"
              size="lg"
              message="Odkrywanie linii orzeczniczych..."
              subtitle="Klasteryzacja orzeczen na podstawie podobienstwa semantycznego"
            />
          )}

          {/* Error state */}
          {hasError && !isLoading && (
            <ErrorCard
              title="Blad odkrywania"
              message={errorMessage}
              onRetry={handleDiscover}
              retryLabel="Sprobuj ponownie"
            />
          )}

          {/* Statistics bar */}
          {results && !isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                icon={Hash}
                label="Dokumenty"
                value={results.statistics.total_documents.toLocaleString('pl-PL')}
              />
              <StatCard
                icon={GitBranch}
                label="Klastry"
                value={results.statistics.num_clusters.toString()}
              />
              <StatCard
                icon={BarChart3}
                label="Koherencja"
                value={formatCoherence(results.statistics.avg_coherence)}
              />
              <StatCard
                icon={Clock}
                label="Czas"
                value={`${(results.statistics.processing_time_ms / 1000).toFixed(1)}s`}
              />
            </div>
          )}

          {/* Cluster results */}
          {results && !isLoading && results.clusters.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Odkryte linie orzecznicze ({results.clusters.length})
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {results.clusters.map((cluster, index) => (
                  <ClusterCard
                    key={cluster.cluster_id}
                    cluster={cluster}
                    colorIndex={index}
                    isExpanded={expandedClusters.has(cluster.cluster_id)}
                    onToggleExpand={() => toggleClusterExpansion(cluster.cluster_id)}
                    onSave={() => handleSaveCluster(cluster)}
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
                title="Linie orzecznicze"
                description="Skonfiguruj parametry powyzej i kliknij 'Odkryj linie', aby automatycznie pogrupowac orzeczenia dotyczace tych samych zagadnien prawnych."
                icon={GitBranch}
              />

              {/* How it works explanation */}
              <BaseCard clickable={false} variant="light" className="rounded-[16px]">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Jak to dziala</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary">Klasteryzacja semantyczna</div>
                      <p className="text-xs text-muted-foreground">
                        Orzeczenia sa grupowane na podstawie podobienstwa znaczeniowego ich tresci i uzasadnien.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary">Wspolne podstawy prawne</div>
                      <p className="text-xs text-muted-foreground">
                        Klastry laczy wspolne odwolania do tych samych przepisow i aktow prawnych.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary">Analiza koherencji</div>
                      <p className="text-xs text-muted-foreground">
                        Kazdy klaster otrzymuje ocene spojnosci — im wyzsza, tym bardziej jednorodna linia orzecznicza.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary">Slowa kluczowe</div>
                      <p className="text-xs text-muted-foreground">
                        Automatyczne wyodrebnianie najwazniejszych terminow charakteryzujacych kazdy klaster.
                      </p>
                    </div>
                  </div>
                </div>
              </BaseCard>
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
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
        </div>
      </div>
    </BaseCard>
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
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
}) {
  const colorClass = getClusterColor(colorIndex);

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
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
                Liczba spraw: {cluster.case_count}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(cluster.date_range.start)} - {formatDate(cluster.date_range.end)}
              </span>
            </div>
          </div>
          {/* Coherence indicator */}
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-muted-foreground">Koherencja</p>
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
              Podstawy prawne
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
              {isExpanded ? 'Ukryj sprawy' : `Pokaz sprawy (${cluster.top_cases.length})`}
            </button>
          ) : (
            <div />
          )}

          {/* Save button */}
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
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving
              ? 'Zapisywanie...'
              : isSaved
                ? 'Zapisano'
                : 'Zapisz jako linie'}
          </Button>
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
                <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/50 border border-slate-100 hover:border-primary/20 hover:bg-white/80 transition-all">
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
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
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
    </BaseCard>
  );
}

/** Small coherence score badge with color coding */
function CoherenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  // Color thresholds: green >= 70%, yellow >= 50%, red < 50%
  const colorClass =
    pct >= 70
      ? 'bg-emerald-100 text-emerald-700'
      : pct >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${colorClass}`}
    >
      {pct}%
    </span>
  );
}

/** Status badge for a reasoning line */
function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'archived'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-rose-100 text-rose-700';

  const labelMap: Record<string, string> = {
    active: 'Aktywna',
    archived: 'Zarchiwizowana',
    deleted: 'Usunieta',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
    >
      {labelMap[status] ?? status}
    </span>
  );
}

/** Saved Lines tab content — includes semantic search bar (M6) */
function SavedLinesTab({
  query,
}: {
  query: ReturnType<typeof useQuery<ReasoningLineSummary[]>>;
}) {
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

  // Show search results when a search is active, otherwise show saved lines
  const isSearchActive = shouldSearch;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Szukaj linii orzeczniczych..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-white/50"
          aria-label="Szukaj linii orzeczniczych"
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
              title="Blad wyszukiwania"
              message={searchQuery.error?.message ?? 'Nie udalo sie wyszukac linii.'}
              onRetry={() => searchQuery.refetch()}
              retryLabel="Sprobuj ponownie"
            />
          )}

          {searchQuery.data && searchQuery.data.results.length === 0 && (
            <EmptyState
              title="Brak wynikow"
              description={`Nie znaleziono linii orzeczniczych pasujacych do "${debouncedTerm}".`}
              icon={Search}
            />
          )}

          {searchQuery.data && searchQuery.data.results.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Wyniki wyszukiwania ({searchQuery.data.total_found})
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
              message="Ladowanie zapisanych linii..."
            />
          )}

          {query.isError && (
            <ErrorCard
              title="Blad ladowania"
              message={query.error?.message ?? 'Nie udalo sie pobrac zapisanych linii.'}
              onRetry={() => query.refetch()}
              retryLabel="Sprobuj ponownie"
            />
          )}

          {!query.isLoading && !query.isError && (query.data ?? []).length === 0 && (
            <EmptyState
              title="Brak zapisanych linii"
              description="Odkryj klastry w zakladce 'Odkryj' i zapisz interesujace linie orzecznicze."
              icon={BookMarked}
            />
          )}

          {!query.isLoading && !query.isError && (query.data ?? []).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Zapisane linie orzecznicze ({(query.data ?? []).length})
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
      <BaseCard clickable={false} variant="light" className="rounded-[16px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Automatyczny pipeline</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
            <div className="space-y-1">
              <div className="font-medium text-foreground">Auto-przypisanie</div>
              <p>Nowe orzeczenia automatycznie przypisywane do istniejacych linii</p>
              <Badge variant="outline" className="text-[10px]">Co tydzien</Badge>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground">Auto-odkrywanie</div>
              <p>Nieprzypisane orzeczenia grupowane w nowe linie</p>
              <Badge variant="outline" className="text-[10px]">Co tydzien</Badge>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground">Wykrywanie zdarzen</div>
              <p>Automatyczne wykrywanie rozgalezien i polaczen</p>
              <Badge variant="outline" className="text-[10px]">Co tydzien</Badge>
            </div>
          </div>
        </div>
      </BaseCard>
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
  const colorClass = getClusterColor(colorIndex);
  const similarityPct = Math.round(result.similarity * 100);

  return (
    <Link href={`/reasoning-lines/${result.id}`} className="block group">
      <BaseCard clickable variant="light" className="rounded-[16px]">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-semibold text-base text-foreground group-hover:text-primary transition-colors truncate">
                {result.label}
              </h3>
              {result.legal_question && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {result.legal_question}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              {/* Similarity badge */}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-primary/10 text-primary">
                {similarityPct}% trafnosc
              </span>
              <CoherenceBadge score={result.coherence_score} />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {result.case_count} spraw
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
                <Badge key={base} variant="outline" className="text-xs">
                  {base}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </BaseCard>
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
  const colorClass = getClusterColor(colorIndex);

  return (
    <Link href={`/reasoning-lines/${line.id}`} className="block group">
      <BaseCard clickable variant="light" className="rounded-[16px]">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-semibold text-base text-foreground group-hover:text-primary transition-colors truncate">
                {line.label}
              </h3>
              {line.legal_question && (
                <p className="text-xs text-muted-foreground line-clamp-2">
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
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {line.case_count} spraw
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
                <Badge key={base} variant="outline" className="text-xs">
                  {base}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </BaseCard>
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
}: {
  dagQuery: ReturnType<typeof useQuery>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detectEventsMutation: ReturnType<typeof useMutation<EventDetectionResult, Error, void, any>>;
  eventResult: EventDetectionResult | null;
}) {
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
          Graf DAG linii orzeczniczych
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => detectEventsMutation.mutate()}
          disabled={detectEventsMutation.isPending}
          className="flex items-center gap-1.5 text-xs"
        >
          <GitMerge className="h-3.5 w-3.5" />
          {detectEventsMutation.isPending ? 'Wykrywanie...' : 'Wykryj zdarzenia'}
        </Button>
      </div>

      {/* Event detection feedback */}
      {detectEventsMutation.isError && (
        <span className="text-xs text-rose-600">
          {detectEventsMutation.error?.message ?? 'Blad wykrywania zdarzen'}
        </span>
      )}
      {eventResult && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-red-50 text-red-700">
            Rozgalezienia: {eventResult.branches_detected}
          </span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">
            Polaczenia: {eventResult.merges_detected}
          </span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">
            Wplywy: {eventResult.influences_detected}
          </span>
          <span className="px-2 py-1 rounded bg-slate-50 text-slate-600">
            Linii: {eventResult.lines_analyzed}
          </span>
          <span className="px-2 py-1 rounded bg-slate-50 text-slate-600">
            Czas: {(eventResult.processing_time_ms / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Loading */}
      {dagQuery.isLoading && (
        <LoadingIndicator
          variant="centered"
          size="lg"
          message="Ladowanie grafu DAG..."
        />
      )}

      {/* Error */}
      {dagQuery.isError && (
        <ErrorCard
          title="Blad ladowania grafu"
          message={(dagQuery.error as Error)?.message ?? 'Nie udalo sie pobrac grafu DAG.'}
          onRetry={() => dagQuery.refetch()}
          retryLabel="Sprobuj ponownie"
        />
      )}

      {/* Empty state */}
      {dagData && dagData.nodes.length === 0 && (
        <EmptyState
          title="Brak danych w grafie"
          description="Zapisz linie orzecznicze i wykryj zdarzenia, aby zobaczyc graf DAG."
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
            label="Wezly"
            value={dagData.statistics.total_nodes.toString()}
          />
          <StatCard
            icon={GitBranch}
            label="Krawedzie"
            value={dagData.statistics.total_edges.toString()}
          />
          {eventResult && (
            <>
              <StatCard
                icon={GitBranch}
                label="Rozgalezienia"
                value={eventResult.branches_detected.toString()}
              />
              <StatCard
                icon={GitMerge}
                label="Polaczenia"
                value={eventResult.merges_detected.toString()}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
