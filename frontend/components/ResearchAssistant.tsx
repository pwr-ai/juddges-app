"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Search,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Lightbulb,
  Target,
  BookOpen,
  Save,
} from "lucide-react";
import {
  BaseCard,
  Badge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Button,
} from "@/lib/styles/components";
import {
  analyzeResearchContext,
  getResearchSuggestions,
  saveResearchContext,
} from "@/lib/api";
import { trackDocumentInteraction } from "@/lib/api";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import type {
  AnalyzeResearchResponse,
  QuickSuggestion,
  ResearchTopic,
  KnowledgeGap,
  ResearchStep,
  RelatedDocument,
} from "@/types/research-assistant";

// ===== Sub-components =====

function TopicCard({ topic }: { topic: ResearchTopic }) {
  const relevancePercent = Math.round(topic.relevance * 100);
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
      <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">
            {topic.name}
          </span>
          <Badge variant="secondary" className="text-xs">
            {relevancePercent}% relevance
          </Badge>
          {topic.document_count > 0 && (
            <span className="text-xs text-muted-foreground">
              {topic.document_count} docs
            </span>
          )}
        </div>
        {topic.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {topic.description}
          </p>
        )}
      </div>
    </div>
  );
}

function GapCard({
  gap,
  onExplore,
}: {
  gap: KnowledgeGap;
  onExplore: (query: string) => void;
}) {
  const severityColor =
    gap.severity === "high"
      ? "text-red-600 dark:text-red-400"
      : gap.severity === "medium"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-blue-600 dark:text-blue-400";

  const severityBg =
    gap.severity === "high"
      ? "bg-red-50 dark:bg-red-950/30 border-red-200/50 dark:border-red-800/30"
      : gap.severity === "medium"
        ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200/50 dark:border-yellow-800/30"
        : "bg-blue-50 dark:bg-blue-950/30 border-blue-200/50 dark:border-blue-800/30";

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${severityBg}`}>
      <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${severityColor}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">
            {gap.topic}
          </span>
          <Badge variant="outline" className={`text-xs ${severityColor}`}>
            {gap.severity}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{gap.description}</p>
        {gap.suggested_query && (
          <button
            onClick={() => onExplore(gap.suggested_query!)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Search className="h-3 w-3" />
            Search: &quot;{gap.suggested_query}&quot;
          </button>
        )}
      </div>
    </div>
  );
}

function StepCard({
  step,
  onAction,
}: {
  step: ResearchStep;
  onAction: (step: ResearchStep) => void;
}) {
  const actionIcon =
    step.action_type === "search" ? (
      <Search className="h-4 w-4" />
    ) : step.action_type === "read_document" ? (
      <BookOpen className="h-4 w-4" />
    ) : step.action_type === "compare_documents" ? (
      <Target className="h-4 w-4" />
    ) : (
      <Lightbulb className="h-4 w-4" />
    );

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
        {actionIcon}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-sm text-foreground">
          {step.title}
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">
          {step.description}
        </p>
      </div>
      <button
        onClick={() => onAction(step)}
        className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RelatedDocCard({
  doc,
  onView,
}: {
  doc: RelatedDocument;
  onView: (docId: string) => void;
}) {
  const scorePercent = Math.round(doc.relevance_score * 100);

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-sm leading-tight text-foreground truncate">
              {doc.title || doc.document_id}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              {doc.document_type && (
                <Badge variant="secondary" className="text-xs">
                  {doc.document_type.replace(/_/g, " ")}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground italic">
                {doc.reason}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-sm font-bold text-primary">{scorePercent}%</div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => onView(doc.document_id)}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </button>
        </div>
      </div>
    </BaseCard>
  );
}

// ===== Main Component =====

interface ResearchAssistantProps {
  showSearch?: boolean;
  showAnalyze?: boolean;
  initialQuery?: string;
}

export default function ResearchAssistant({
  showSearch = true,
  showAnalyze = true,
  initialQuery,
}: ResearchAssistantProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialQuery || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<QuickSuggestion | null>(null);
  const [mode, setMode] = useState<"suggestions" | "analysis">("suggestions");

  const fetchSuggestions = useCallback(
    async (q?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getResearchSuggestions({
          query: q || searchQuery || undefined,
          limit: 8,
        });
        setSuggestions(result);
        setMode("suggestions");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load suggestions."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery]
  );

  const fetchAnalysis = useCallback(
    async (q?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await analyzeResearchContext({
          query: q || searchQuery || undefined,
        });
        setAnalysis(result);
        setMode("analysis");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to analyze research context."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery]
  );

  const handleSaveContext = useCallback(async () => {
    if (!analysis) return;
    setIsSaving(true);

    try {
      await saveResearchContext({
        title: searchQuery || "Research Analysis",
        analyzed_topics: analysis.topics,
        identified_gaps: analysis.gaps,
        suggested_next_steps: analysis.next_steps,
        related_document_ids: analysis.related_documents.map(
          (d) => d.document_id
        ),
        coverage_score: analysis.coverage_score,
      });
    } catch {
      // Non-critical
    } finally {
      setIsSaving(false);
    }
  }, [analysis, searchQuery]);

  const handleViewDocument = useCallback(
    (docId: string) => {
      trackDocumentInteraction({
        document_id: docId,
        interaction_type: "search_click",
        context: { source: "research_assistant" },
      });

      const cleanId = cleanDocumentIdForUrl(docId);
      router.push(`/documents/${cleanId}?from=research-assistant`);
    },
    [router]
  );

  const handleStepAction = useCallback(
    (step: ResearchStep) => {
      if (step.action_type === "search" && step.query) {
        router.push(`/search?q=${encodeURIComponent(step.query)}`);
      } else if (
        step.action_type === "read_document" &&
        step.document_ids?.length
      ) {
        const cleanId = cleanDocumentIdForUrl(step.document_ids[0]);
        router.push(`/documents/${cleanId}`);
      } else if (step.query) {
        setSearchQuery(step.query);
        fetchSuggestions(step.query);
      }
    },
    [router, fetchSuggestions]
  );

  const handleExploreGap = useCallback(
    (query: string) => {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    },
    [router]
  );

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      fetchSuggestions(searchQuery.trim());
    }
  }, [searchQuery, fetchSuggestions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  const coveragePercent = analysis
    ? Math.round(analysis.coverage_score * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Search input */}
      {showSearch && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your research topic to get AI-powered suggestions..."
                className="w-full h-10 pl-10 pr-4 rounded-[12px] bg-[rgba(255,255,255,0.9)] dark:bg-[rgba(30,41,59,0.6)] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isLoading || !searchQuery.trim()}
              className="rounded-[12px]"
            >
              {isLoading && mode === "suggestions" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Quick Suggest"
              )}
            </Button>
            {showAnalyze && (
              <Button
                onClick={() => fetchAnalysis(searchQuery.trim())}
                disabled={isLoading || !searchQuery.trim()}
                variant="outline"
                className="rounded-[12px]"
              >
                {isLoading && mode === "analysis" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-1" />
                    Deep Analysis
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <LoadingIndicator
          variant="centered"
          message={
            mode === "analysis"
              ? "Analyzing your research context with AI..."
              : "Finding suggestions..."
          }
        />
      )}

      {/* Error */}
      {error && !isLoading && (
        <ErrorCard
          title="Research Assistant Error"
          message={error}
          onRetry={() =>
            mode === "analysis" ? fetchAnalysis() : fetchSuggestions()
          }
        />
      )}

      {/* Deep Analysis Results */}
      {analysis && mode === "analysis" && !isLoading && (
        <div className="space-y-6">
          {/* Summary & Coverage */}
          <BaseCard clickable={false} variant="light" className="rounded-[16px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base text-foreground">
                    Research Analysis
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Coverage
                    </span>
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${coveragePercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {coveragePercent}%
                    </span>
                  </div>
                  <button
                    onClick={handleSaveContext}
                    disabled={isSaving}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Save className="h-3 w-3" />
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => fetchAnalysis()}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {analysis.analysis_summary}
              </p>
            </div>
          </BaseCard>

          {/* Topics */}
          {analysis.topics.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Research Topics ({analysis.topics.length})
              </h3>
              <div className="grid gap-2">
                {analysis.topics.map((topic, i) => (
                  <TopicCard key={i} topic={topic} />
                ))}
              </div>
            </div>
          )}

          {/* Knowledge Gaps */}
          {analysis.gaps.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Knowledge Gaps ({analysis.gaps.length})
              </h3>
              <div className="grid gap-2">
                {analysis.gaps.map((gap, i) => (
                  <GapCard key={i} gap={gap} onExplore={handleExploreGap} />
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          {analysis.next_steps.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Suggested Next Steps ({analysis.next_steps.length})
              </h3>
              <div className="grid gap-2">
                {analysis.next_steps.map((step, i) => (
                  <StepCard key={i} step={step} onAction={handleStepAction} />
                ))}
              </div>
            </div>
          )}

          {/* Related Documents */}
          {analysis.related_documents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Related Documents ({analysis.related_documents.length})
              </h3>
              <div className="grid gap-2">
                {analysis.related_documents.map((doc) => (
                  <RelatedDocCard
                    key={doc.document_id}
                    doc={doc}
                    onView={handleViewDocument}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Suggestions Results */}
      {suggestions && mode === "suggestions" && !isLoading && (
        <div className="space-y-6">
          {/* Trending Topics */}
          {suggestions.trending_topics.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Trending in Your Research
              </h3>
              <div className="flex flex-wrap gap-2">
                {suggestions.trending_topics.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => {
                      setSearchQuery(topic);
                      fetchSuggestions(topic);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          {suggestions.next_steps.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Suggested Next Steps
              </h3>
              <div className="grid gap-2">
                {suggestions.next_steps.map((step, i) => (
                  <StepCard key={i} step={step} onAction={handleStepAction} />
                ))}
              </div>
            </div>
          )}

          {/* Related Documents */}
          {suggestions.related_documents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Related Documents ({suggestions.related_documents.length})
                </h3>
                <button
                  onClick={() => fetchSuggestions()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              </div>
              <div className="grid gap-2">
                {suggestions.related_documents.map((doc) => (
                  <RelatedDocCard
                    key={doc.document_id}
                    doc={doc}
                    onView={handleViewDocument}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty suggestions */}
          {suggestions.related_documents.length === 0 &&
            suggestions.next_steps.length === 0 &&
            suggestions.trending_topics.length === 0 && (
              <EmptyState
                icon={Brain}
                title="No suggestions yet"
                description="Try searching for a legal topic to get AI-powered research suggestions."
              />
            )}
        </div>
      )}

      {/* Initial state */}
      {!analysis && !suggestions && !isLoading && !error && (
        <EmptyState
          icon={Brain}
          title="AI Research Assistant"
          description="Describe your research topic to get intelligent suggestions, identify knowledge gaps, and discover related documents. Use 'Quick Suggest' for fast results or 'Deep Analysis' for comprehensive AI-powered research guidance."
        />
      )}
    </div>
  );
}
