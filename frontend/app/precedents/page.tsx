'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, Search, Loader2, ChevronDown, ChevronUp, ExternalLink, Filter } from 'lucide-react';
import {
  PageContainer,
  AIDisclaimerBadge,
  LoadingIndicator,
  EmptyState,
  ErrorCard,
} from '@/lib/styles/components';
import { EditorialCard, Eyebrow, Headline } from '@/components/editorial';
import { Badge } from '@/components/ui/badge';
import { findPrecedents, type FindPrecedentsResponse, type PrecedentMatch } from '@/lib/api';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { useTranslation } from '@/contexts/LanguageContext';
import { CohortInsights, type CohortFilter } from '@/app/precedents/_components/CohortInsights';
import { cohortIdsWithValue } from '@/lib/precedents/cohort-grouping';

function PrecedentResultCard({
  precedent,
  rank,
  onViewDocument,
}: {
  precedent: PrecedentMatch;
  rank: number;
  onViewDocument: (documentId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const scorePercent = Math.round(
    ((precedent.relevance_score ?? precedent.similarity_score) * 100)
  );

  const scoreTone =
    scorePercent >= 80
      ? 'text-ink'
      : scorePercent >= 60
      ? 'text-gold'
      : 'text-oxblood';

  return (
    <EditorialCard flat className="p-4">
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-7 h-7 border border-rule bg-parchment-deep flex items-center justify-center font-mono text-xs font-bold text-ink">
              #{rank}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-base leading-tight text-ink truncate">
                {precedent.title || precedent.document_id}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {precedent.document_type && (
                  <Badge variant="outline" className="rounded-none font-mono text-[10px] uppercase tracking-wider border-rule bg-parchment-deep text-ink">
                    {precedent.document_type.replace(/_/g, ' ')}
                  </Badge>
                )}
                {precedent.date_issued && (
                  <span className="font-mono text-xs text-ink-soft">
                    {precedent.date_issued}
                  </span>
                )}
                {precedent.court_name && (
                  <span className="text-xs text-ink-soft">
                    {precedent.court_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Score badge */}
          <div className="flex-shrink-0 text-right">
            <div className={`text-lg font-bold font-mono tabular-nums ${scoreTone}`}>
              {scorePercent}%
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">relevance</div>
          </div>
        </div>

        {/* Matching factors */}
        {precedent.matching_factors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {precedent.matching_factors.map((factor, idx) => (
              <Badge key={idx} variant="outline" className="rounded-none font-mono text-xs border-rule text-ink-soft">
                {factor}
              </Badge>
            ))}
          </div>
        )}

        {/* Relevance explanation */}
        {precedent.relevance_explanation && (
          <p className="text-sm text-ink-soft leading-relaxed">
            {precedent.relevance_explanation}
          </p>
        )}

        {/* Expandable details */}
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink transition-colors font-mono"
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {isExpanded ? 'Hide details' : 'Show details'}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-2 pt-3 border-t border-rule">
              {precedent.outcome && (
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">Outcome: </span>
                  <span className="text-sm text-ink">{precedent.outcome}</span>
                </div>
              )}
              {precedent.legal_bases && precedent.legal_bases.length > 0 && (
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">Legal bases: </span>
                  <span className="text-sm font-mono text-ink">{precedent.legal_bases.join(', ')}</span>
                </div>
              )}
              {precedent.summary && (
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">Summary: </span>
                  <p className="text-sm text-ink mt-1">{precedent.summary}</p>
                </div>
              )}
              <div className="flex items-center gap-4 pt-2 font-mono text-xs text-ink-soft">
                <span>
                  Similarity: {Math.round(precedent.similarity_score * 100)}%
                </span>
                {precedent.relevance_score !== null && (
                  <span>
                    AI Relevance: {Math.round(precedent.relevance_score * 100)}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* View document button */}
        <div className="flex justify-end">
          <button
            onClick={() => onViewDocument(precedent.document_id)}
            className="inline-flex items-center gap-1.5 text-sm text-oxblood hover:underline font-mono"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View document
          </button>
        </div>
      </div>
    </EditorialCard>
  );
}

export default function PrecedentsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FindPrecedentsResponse | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cohortFilter, setCohortFilter] = useState<CohortFilter | null>(null);

  // Filter state
  const [filterDocTypes, setFilterDocTypes] = useState<string[]>([]);
  const [filterLanguage, setFilterLanguage] = useState<string>('');
  const [resultLimit, setResultLimit] = useState(10);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || query.trim().length < 10) {
      setError('Please enter a more detailed description (at least 10 characters).');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const filters: Record<string, unknown> = {};
      if (filterDocTypes.length > 0) {
        filters.document_types = filterDocTypes;
      }
      if (filterLanguage) {
        filters.language = filterLanguage;
      }

      const response = await findPrecedents({
        query: query.trim(),
        limit: resultLimit,
        include_analysis: true,
        filters: Object.keys(filters).length > 0 ? filters as never : undefined,
      });

      setResults(response);
      setCohortFilter(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [query, filterDocTypes, filterLanguage, resultLimit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleViewDocument = useCallback(
    (documentId: string) => {
      const cleanId = cleanDocumentIdForUrl(documentId);
      router.push(`/documents/${cleanId}?from=precedents`);
    },
    [router]
  );

  const toggleDocType = (type: string) => {
    setFilterDocTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const cohort = useMemo(() => results?.cohort ?? [], [results]);
  const visiblePrecedents = useMemo(() => {
    if (!results) return [];
    if (!cohortFilter) return results.precedents;
    const ids = cohortIdsWithValue(cohort, cohortFilter.field, cohortFilter.value);
    return results.precedents.filter((p) => ids.has(p.document_id));
  }, [results, cohort, cohortFilter]);

  return (
    <PageContainer width="medium" fillViewport>
      {/* Header */}
      <header className="mb-6">
        <Eyebrow tone="oxblood" className="mb-2">
          Case Law Research
        </Eyebrow>
        <Headline as="h1" size="md">
          Precedent Finder
        </Headline>
        <p className="mt-2 text-base text-ink-soft">
          Find relevant precedent cases using semantic search and legal reasoning
        </p>
        <div className="mt-3">
          <AIDisclaimerBadge />
        </div>
      </header>

      {/* Search Input */}
      <div className="space-y-3">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the fact pattern, legal issue, or question you want to find precedents for...&#10;&#10;Example: contractor failed to complete construction works on time and the investor seeks damages"
            className="w-full min-h-[120px] p-4 pr-12 rounded-none bg-parchment border border-rule text-ink placeholder:text-ink-soft text-sm leading-relaxed resize-y focus:outline-none focus:border-ink"
          />
          <button
            onClick={handleSearch}
            disabled={isLoading || !query.trim()}
            className="absolute right-3 bottom-3 p-2 rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Search for precedents"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Filter toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-ink-soft hover:text-ink transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
            {showFilters ? 'Hide filters' : 'Show filters'}
          </button>
          {(filterDocTypes.length > 0 || filterLanguage) && (
            <span className="font-mono text-xs text-oxblood">
              {filterDocTypes.length + (filterLanguage ? 1 : 0)} filter(s) active
            </span>
          )}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <EditorialCard flat className="p-4">
            <div className="space-y-4">
              {/* Document types */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                  Document Type
                </label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['judgment'].map((type) => (
                    <button
                      key={type}
                      onClick={() => toggleDocType(type)}
                      className={`px-3 py-1.5 rounded-none font-mono text-xs uppercase tracking-wider border ${
                        filterDocTypes.includes(type)
                          ? 'border-ink bg-ink text-parchment'
                          : 'border-rule bg-parchment-deep text-ink-soft hover:border-ink hover:text-ink'
                      }`}
                    >
                      {type.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                  Language
                </label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { code: '', label: 'All' },
                    { code: 'pl', label: 'Polish' },
                    { code: 'en', label: 'English' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setFilterLanguage(lang.code)}
                      className={`px-3 py-1.5 rounded-none font-mono text-xs uppercase tracking-wider border ${
                        filterLanguage === lang.code
                          ? 'border-ink bg-ink text-parchment'
                          : 'border-rule bg-parchment-deep text-ink-soft hover:border-ink hover:text-ink'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Result limit */}
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-ink-soft">
                  Results
                </label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[5, 10, 20].map((limit) => (
                    <button
                      key={limit}
                      onClick={() => setResultLimit(limit)}
                      className={`px-3 py-1.5 rounded-none font-mono text-xs uppercase tracking-wider border ${
                        resultLimit === limit
                          ? 'border-ink bg-ink text-parchment'
                          : 'border-rule bg-parchment-deep text-ink-soft hover:border-ink hover:text-ink'
                      }`}
                    >
                      {limit} results
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </EditorialCard>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <LoadingIndicator
          variant="centered"
          size="lg"
          message="Searching for precedents..."
          subtitle="Analyzing legal documents with AI reasoning"
        />
      )}

      {/* Error state */}
      {error && !isLoading && (
        <ErrorCard title="Search Error" message={error} />
      )}

      {/* Results */}
      {results && !isLoading && (
        <div className="space-y-4">
          {results.resolved_case && (
            <p
              className="border border-rule bg-parchment-deep px-3 py-2 font-mono text-xs text-ink-soft"
              role="status"
            >
              {t('precedents.resolvedCase', { caseNumber: results.resolved_case.case_number })}
            </p>
          )}

          <CohortInsights
            cohort={cohort}
            filter={cohortFilter}
            filteredRankedCount={visiblePrecedents.length}
            onFilterChange={setCohortFilter}
          />

          {/* Results header */}
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="space-y-1">
              <h2 className="text-lg font-serif text-ink">
                {results.total_found} Precedent{results.total_found !== 1 ? 's' : ''} Found
              </h2>
              {results.enhanced_query && (
                <div className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <span>Enhanced query: &ldquo;{results.enhanced_query}&rdquo;</span>
                </div>
              )}
            </div>
            <Badge variant="outline" className="rounded-none font-mono text-xs uppercase tracking-wider border-rule text-ink-soft">
              {results.search_strategy}
            </Badge>
          </div>

          {/* Results list */}
          {visiblePrecedents.length > 0 ? (
            <div className="space-y-3">
              {visiblePrecedents.map((precedent) => (
                <PrecedentResultCard
                  key={precedent.document_id}
                  precedent={precedent}
                  rank={
                    results.precedents.findIndex((p) => p.document_id === precedent.document_id) +
                    1
                  }
                  onViewDocument={handleViewDocument}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No precedents found"
              description="Try broadening your search query or adjusting the filters."
              icon={Scale}
            />
          )}
        </div>
      )}

      {/* Empty state before search */}
      {!results && !isLoading && !error && (
        <div className="space-y-6">
          <EmptyState
            title="Find relevant precedents"
            description="Describe a fact pattern, legal issue, or question to discover matching case law."
            icon={Scale}
          />

          {/* Example queries */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-ink-soft">Example queries</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'Odliczenie VAT od wydatków na samochód firmowy używany częściowo do celów prywatnych',
                'Tax treatment of cross-border services between EU member states',
                'Kary umowne jako koszt uzyskania przychodów w CIT',
                'Transfer pricing adjustments for related party transactions',
              ].map((example) => (
                <EditorialCard
                  key={example}
                  clickable
                  onClick={() => {
                    setQuery(example);
                  }}
                  flat
                  className="p-4 hover:border-ink"
                >
                  <p className="text-sm text-ink leading-relaxed">{example}</p>
                </EditorialCard>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
