'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  GitBranch,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Target,
  X,
} from 'lucide-react';
import {
  PageContainer,
  BaseCard,
  Badge,
  AIDisclaimerBadge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
  Button,
} from '@/lib/styles/components';
import {
  analyzeArguments,
  type AnalyzeArgumentsResponse,
  type ArgumentResult,
} from '@/lib/api';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';

const REASONING_PATTERN_LABELS: Record<string, { label: string; description: string }> = {
  deductive: { label: 'Deductive', description: 'Applying general rule to specific case' },
  analogical: { label: 'Analogical', description: 'Comparing to similar cases' },
  policy: { label: 'Policy-based', description: 'Based on policy objectives or legislative intent' },
  textual: { label: 'Textual', description: 'Strict interpretation of statutory text' },
  teleological: { label: 'Teleological', description: 'Purpose-based interpretation' },
};

const STRENGTH_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  strong: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  moderate: { icon: Shield, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  weak: { icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

function ArgumentCard({
  argument,
  index,
  isStrongest,
  onViewDocument,
}: {
  argument: ArgumentResult;
  index: number;
  isStrongest: boolean;
  onViewDocument: (documentId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const strengthConfig = STRENGTH_CONFIG[argument.strength] || STRENGTH_CONFIG.moderate;
  const StrengthIcon = strengthConfig.icon;
  const patternInfo = REASONING_PATTERN_LABELS[argument.reasoning_pattern] || {
    label: argument.reasoning_pattern,
    description: '',
  };

  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">#{index + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base leading-tight text-foreground">
                  {argument.title}
                </h3>
                {isStrongest && (
                  <Badge variant="default" className="text-xs">
                    Strongest
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {argument.party}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {patternInfo.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Strength badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${strengthConfig.bgColor}`}>
            <StrengthIcon className={`h-3.5 w-3.5 ${strengthConfig.color}`} />
            <span className={`text-xs font-medium capitalize ${strengthConfig.color}`}>
              {argument.strength}
            </span>
          </div>
        </div>

        {/* Conclusion */}
        <div className="pl-11">
          <div className="flex items-start gap-2">
            <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Conclusion
              </span>
              <p className="text-sm text-foreground mt-0.5 leading-relaxed">
                {argument.conclusion}
              </p>
            </div>
          </div>
        </div>

        {/* Strength explanation */}
        <p className="pl-11 text-xs text-muted-foreground leading-relaxed">
          {argument.strength_explanation}
        </p>

        {/* Expandable details */}
        <div className="pl-11">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {isExpanded ? 'Hide details' : 'Show premises, counter-arguments & references'}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-4 pt-3 border-t border-border/50">
              {/* Factual premises */}
              {argument.factual_premises.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Factual Premises
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {argument.factual_premises.map((premise, idx) => (
                      <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-muted-foreground mt-1">-</span>
                        <span>{premise}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Legal premises */}
              {argument.legal_premises.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Legal Premises
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {argument.legal_premises.map((premise, idx) => (
                      <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span>{premise}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Counter-arguments */}
              {argument.counter_arguments.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Counter-Arguments
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {argument.counter_arguments.map((counter, idx) => (
                      <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span>{counter}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Legal references */}
              {argument.legal_references.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Legal References
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {argument.legal_references.map((ref, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {ref}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Source section */}
              {argument.source_section && (
                <div className="text-xs text-muted-foreground">
                  Source: {argument.source_section}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </BaseCard>
  );
}

function OverallAnalysisCard({
  analysis,
  argumentCount,
}: {
  analysis: AnalyzeArgumentsResponse['overall_analysis'];
  argumentCount: number;
}) {
  return (
    <BaseCard clickable={false} variant="light" className="rounded-[16px]">
      <div className="space-y-4">
        <h3 className="font-semibold text-base text-foreground">Overall Analysis</h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-xl bg-primary/5">
            <div className="text-2xl font-bold text-primary">{argumentCount}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Arguments Found</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-primary/5">
            <div className="text-sm font-semibold text-primary capitalize">
              {REASONING_PATTERN_LABELS[analysis.dominant_reasoning_pattern]?.label || analysis.dominant_reasoning_pattern}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Dominant Pattern</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-primary/5 col-span-2">
            <div className="text-sm font-semibold text-primary">
              {analysis.key_disputes.length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Key Disputes</div>
          </div>
        </div>

        {/* Argument flow */}
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Argument Flow
          </span>
          <p className="text-sm text-foreground mt-1 leading-relaxed">
            {analysis.argument_flow}
          </p>
        </div>

        {/* Key disputes */}
        {analysis.key_disputes.length > 0 && (
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Key Disputes
            </span>
            <ul className="mt-1.5 space-y-1">
              {analysis.key_disputes.map((dispute, idx) => (
                <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground mt-1">-</span>
                  <span>{dispute}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </BaseCard>
  );
}

export default function ArgumentationAnalysisPage() {
  const router = useRouter();
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [currentDocId, setCurrentDocId] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [currentFocusArea, setCurrentFocusArea] = useState('');
  const [detailLevel, setDetailLevel] = useState<'basic' | 'detailed'>('detailed');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalyzeArgumentsResponse | null>(null);

  const handleAddDocumentId = useCallback(() => {
    const trimmed = currentDocId.trim();
    if (trimmed && !documentIds.includes(trimmed)) {
      setDocumentIds((prev) => [...prev, trimmed]);
      setCurrentDocId('');
    }
  }, [currentDocId, documentIds]);

  const handleRemoveDocumentId = useCallback((id: string) => {
    setDocumentIds((prev) => prev.filter((d) => d !== id));
  }, []);

  const handleAddFocusArea = useCallback(() => {
    const trimmed = currentFocusArea.trim();
    if (trimmed && !focusAreas.includes(trimmed)) {
      setFocusAreas((prev) => [...prev, trimmed]);
      setCurrentFocusArea('');
    }
  }, [currentFocusArea, focusAreas]);

  const handleRemoveFocusArea = useCallback((area: string) => {
    setFocusAreas((prev) => prev.filter((a) => a !== area));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (documentIds.length === 0) {
      setError('Please add at least one document ID to analyze.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await analyzeArguments({
        document_ids: documentIds,
        focus_areas: focusAreas.length > 0 ? focusAreas : undefined,
        detail_level: detailLevel,
      });

      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [documentIds, focusAreas, detailLevel]);

  const handleKeyDownDocId = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddDocumentId();
      }
    },
    [handleAddDocumentId]
  );

  const handleKeyDownFocusArea = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddFocusArea();
      }
    },
    [handleAddFocusArea]
  );

  const handleViewDocument = useCallback(
    (documentId: string) => {
      const cleanId = cleanDocumentIdForUrl(documentId);
      router.push(`/documents/${cleanId}?from=argumentation`);
    },
    [router]
  );

  const strengthDistribution = useMemo(() => {
    if (!results) return null;
    const counts = { strong: 0, moderate: 0, weak: 0 };
    for (const arg of results.arguments) {
      counts[arg.strength]++;
    }
    return counts;
  }, [results]);

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
              Argumentation Analysis
            </h1>
            <p className="text-sm text-muted-foreground">
              Analyze legal arguments identifying premises, conclusions, reasoning patterns, and counter-arguments
            </p>
          </div>
        </div>
        <AIDisclaimerBadge />
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        {/* Document IDs input */}
        <BaseCard clickable={false} variant="light" className="rounded-[16px]">
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Document IDs to Analyze
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentDocId}
                onChange={(e) => setCurrentDocId(e.target.value)}
                onKeyDown={handleKeyDownDocId}
                placeholder="Enter a document ID and press Enter..."
                className="flex-1 px-3 py-2 rounded-lg bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
              <Button
                onClick={handleAddDocumentId}
                disabled={!currentDocId.trim()}
                size="sm"
              >
                Add
              </Button>
            </div>
            {documentIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {documentIds.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="text-xs flex items-center gap-1 pr-1"
                  >
                    <span className="max-w-[200px] truncate">{id}</span>
                    <button
                      onClick={() => handleRemoveDocumentId(id)}
                      className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Add up to 5 document IDs to analyze their argumentation structure. You can find document IDs from the Search or Documents pages.
            </p>
          </div>
        </BaseCard>

        {/* Focus areas and detail level */}
        <BaseCard clickable={false} variant="light" className="rounded-[16px]">
          <div className="space-y-4">
            {/* Focus areas */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Focus Areas (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentFocusArea}
                  onChange={(e) => setCurrentFocusArea(e.target.value)}
                  onKeyDown={handleKeyDownFocusArea}
                  placeholder="e.g., VAT deductions, transfer pricing..."
                  className="flex-1 px-3 py-2 rounded-lg bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
                <Button
                  onClick={handleAddFocusArea}
                  disabled={!currentFocusArea.trim()}
                  size="sm"
                  variant="outline"
                >
                  Add
                </Button>
              </div>
              {focusAreas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {focusAreas.map((area) => (
                    <Badge
                      key={area}
                      variant="outline"
                      className="text-xs flex items-center gap-1 pr-1"
                    >
                      {area}
                      <button
                        onClick={() => handleRemoveFocusArea(area)}
                        className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Detail level */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Detail Level
              </label>
              <div className="flex gap-2">
                {(['basic', 'detailed'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setDetailLevel(level)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      detailLevel === level
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {level === 'basic' ? 'Basic (main arguments)' : 'Detailed (full analysis)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Analyze button */}
            <Button
              onClick={handleAnalyze}
              disabled={isLoading || documentIds.length === 0}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Analyze Arguments
            </Button>
          </div>
        </BaseCard>
      </div>

      {/* Loading state */}
      {isLoading && (
        <LoadingIndicator
          variant="centered"
          size="lg"
          message="Analyzing legal arguments..."
          subtitle="Identifying premises, conclusions, and reasoning patterns"
        />
      )}

      {/* Error state */}
      {error && !isLoading && (
        <ErrorCard title="Analysis Error" message={error} />
      )}

      {/* Results */}
      {results && !isLoading && (
        <div className="space-y-4">
          {/* Overall analysis */}
          <OverallAnalysisCard
            analysis={results.overall_analysis}
            argumentCount={results.argument_count}
          />

          {/* Strength distribution */}
          {strengthDistribution && (
            <div className="flex items-center gap-4 px-1">
              <span className="text-xs text-muted-foreground">Strength:</span>
              {(['strong', 'moderate', 'weak'] as const).map((level) => {
                const config = STRENGTH_CONFIG[level];
                const count = strengthDistribution[level];
                if (count === 0) return null;
                return (
                  <div key={level} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${config.bgColor}`} />
                    <span className="text-xs text-muted-foreground capitalize">
                      {level}: {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Arguments list */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              Arguments ({results.argument_count})
            </h2>
            {results.arguments.map((argument, idx) => (
              <ArgumentCard
                key={idx}
                argument={argument}
                index={idx}
                isStrongest={idx === results.overall_analysis.strongest_argument_index}
                onViewDocument={handleViewDocument}
              />
            ))}
          </div>

          {/* Document links */}
          {results.document_ids.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">Analyzed documents:</span>
              {results.document_ids.map((docId) => (
                <button
                  key={docId}
                  onClick={() => handleViewDocument(docId)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{docId}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state before analysis */}
      {!results && !isLoading && !error && (
        <div className="space-y-6">
          <EmptyState
            title="Analyze legal arguments"
            description="Add document IDs to decompose legal arguments into premises, conclusions, reasoning patterns, and counter-arguments."
            icon={GitBranch}
          />

          {/* How it works */}
          <BaseCard clickable={false} variant="light" className="rounded-[16px]">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">How it works</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">Premises</div>
                  <p className="text-xs text-muted-foreground">
                    Identifies factual claims and legal rules that form the basis of each argument.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">Conclusions</div>
                  <p className="text-xs text-muted-foreground">
                    Extracts the conclusions reached by each party from their premises.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">Reasoning Patterns</div>
                  <p className="text-xs text-muted-foreground">
                    Classifies reasoning as deductive, analogical, policy-based, textual, or teleological.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary">Counter-Arguments</div>
                  <p className="text-xs text-muted-foreground">
                    Identifies potential weaknesses and counter-arguments for each position.
                  </p>
                </div>
              </div>
            </div>
          </BaseCard>
        </div>
      )}
    </PageContainer>
  );
}
