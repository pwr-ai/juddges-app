"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
import { NlFilterDialog } from "@/components/search/NlFilterDialog";
import { QuickFilters } from "@/components/search/QuickFilters";
import { SaveAsCollectionDialog } from "@/components/search/SaveAsCollectionDialog";
import { ScopeFilters } from "@/components/search/ScopeFilters";
import { Eyebrow, Headline } from "@/components/editorial";
import { Pagination } from "@/lib/styles/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/lib/styles/components";
import logger from "@/lib/logger";
import {
  useExtractionFacet,
  useExtractionResults,
} from "@/lib/extractions/base-schema-filter-api";
import { useExtractedDataFilters } from "@/lib/extractions/use-extracted-data-filters";
import type { FilterUrlState } from "@/lib/extractions/use-extracted-data-filters";
import { buildDocumentHref } from "@/lib/extractions/document-href";
import { applyDrawerChange, toDrawerFilters } from "@/lib/extractions/drawer-adapter";
import { isCoreFilterField } from "@/lib/extractions/base-schema-filter-config";
import type {
  BaseSchemaFilterRequest,
  BaseSchemaFilterResultRow,
  BaseSchemaFilters,
} from "@/types/base-schema-filter";
import type { BaseFilterValue } from "@/lib/store/searchStore";

import { StatisticsView } from "./_components/StatisticsView";
import { ViewToggle } from "./_components/ViewToggle";

const pageLogger = logger.child("ExtractionSearchPage");

// =============================================================================
// Substring inputs component - sits above the drawer
// =============================================================================

interface SubstringInputsProps {
  appealCourtJudgesNames?: string;
  caseName?: string;
  offenderRepresentativeName?: string;
  onChange: (field: string, value: string | undefined) => void;
  disabled?: boolean;
}

function SubstringInputs({
  appealCourtJudgesNames,
  caseName,
  offenderRepresentativeName,
  onChange,
  disabled,
}: SubstringInputsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="case-name" className="block text-sm font-medium text-muted-foreground mb-1">
            Case name
          </label>
          <Input
            id="case-name"
            placeholder="Search case names..."
            value={caseName ?? ""}
            onChange={(e) => onChange("case_name", e.target.value.trim() || undefined)}
            disabled={disabled}
          />
        </div>
        <div>
          <label htmlFor="judges-names" className="block text-sm font-medium text-muted-foreground mb-1">
            Judges
          </label>
          <Input
            id="judges-names"
            placeholder="Search judge names..."
            value={appealCourtJudgesNames ?? ""}
            onChange={(e) => onChange("appeal_court_judges_names", e.target.value.trim() || undefined)}
            disabled={disabled}
          />
        </div>
        <div>
          <label htmlFor="offender-rep" className="block text-sm font-medium text-muted-foreground mb-1">
            Offender representative
          </label>
          <Input
            id="offender-rep"
            placeholder="Search representatives..."
            value={offenderRepresentativeName ?? ""}
            onChange={(e) => onChange("offender_representative_name", e.target.value.trim() || undefined)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  row,
  urlState,
}: {
  row: BaseSchemaFilterResultRow;
  urlState: FilterUrlState;
}) {
  const date = row.decision_date ? new Date(row.decision_date) : null;
  return (
    <Link
      href={buildDocumentHref(row.id, urlState)}
      className="block border border-[color:var(--rule)] bg-white p-4 transition-colors hover:bg-[color:var(--parchment-deep)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight truncate">
            {row.title ?? row.case_number ?? row.id}
          </h3>
          {row.case_number && row.title && (
            <p className="mt-0.5 font-mono text-[11px] text-[color:var(--ink-soft)]">
              {row.case_number}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.jurisdiction && (
            <Badge variant="outline" className="text-xs">
              {row.jurisdiction}
            </Badge>
          )}
          {date && (
            <span className="text-xs text-muted-foreground">
              {date.toISOString().slice(0, 10)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ResultList({
  rows,
  isLoading,
  hasActiveFilters,
  onClearAll,
  urlState,
}: {
  rows: BaseSchemaFilterResultRow[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearAll: () => void;
  urlState: FilterUrlState;
}) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {hasActiveFilters
            ? "No judgment in the corpus matches every filter at once. Extraction coverage is uneven, so combining several fields narrows results quickly — drop the most specific filter, or clear them all and add them back one at a time."
            : "No extracted judgments are available yet. Once documents have been through structured extraction they become searchable here."}
        </p>
        {hasActiveFilters ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={onClearAll}>
            Clear all filters
          </Button>
        ) : (
          <Button asChild size="sm" className="mt-4">
            <Link href="/extract">Extract from a collection</Link>
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ResultRow key={row.id} row={row} urlState={urlState} />
      ))}
    </div>
  );
}

function ExtractionSearchPage() {
  const {
    filters,
    textQuery,
    page,
    pageSize,
    setFilters,
    setTextQuery,
    setPage,
    setNlQuestion,
    removeFilter,
    clearAll,
    activeCount,
    nlQuestion,
    view,
    sampleSize,
    seed,
    statsFields,
    setView,
    setSampling,
    reshuffle,
    setStatsFields,
  } = useExtractedDataFilters();

  const request = useMemo<BaseSchemaFilterRequest>(
    () => ({
      filters,
      text_query: textQuery.trim() === "" ? undefined : textQuery.trim(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [filters, textQuery, page, pageSize],
  );

  // The list query only runs behind the list view; the statistics view owns
  // its own aggregate query (#708).
  const { data, isLoading, isFetching, error, refetch } = useExtractionResults(
    request,
    view === "list",
  );

  // Never render the raw exception: it leaks internals and gives the reader
  // nothing to act on. Keep it in the console instead.
  useEffect(() => {
    if (error) pageLogger.error("Extraction search failed", error);
  }, [error]);
  const rows = data?.documents ?? [];
  const total = data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const clearText = () => setTextQuery("");

  // Tag-field autocomplete: lazily fetch facet counts for whichever tag_array
  // field the user last focused/typed into (issue #581 — the page never wired
  // this before, so TagArrayControl's suggestion list was permanently empty).
  const [activeFacetField, setActiveFacetField] = useState<string | null>(null);
  const { data: activeFacetValues } = useExtractionFacet(
    activeFacetField,
    Boolean(activeFacetField),
  );
  const facetCounts = useMemo(() => {
    if (!activeFacetField || !activeFacetValues) return undefined;
    const counts: Record<string, number> = {};
    for (const { value, count } of activeFacetValues) counts[value] = count;
    return { [activeFacetField]: counts };
  }, [activeFacetField, activeFacetValues]);
  const onTagQueryChange = (field: string) => setActiveFacetField(field);

  // Drawer state management
  const drawerFilters = toDrawerFilters(filters);

  const setSubstringFilter = (field: string, value: string | undefined) => {
    const next = { ...filters };
    if (value === undefined) {
      delete (next as Record<string, unknown>)[field];
    } else {
      (next as Record<string, unknown>)[field] = value;
    }
    setFilters(next);
  };

  const setDrawerFilter = (field: string, value: BaseFilterValue | undefined) => {
    const next = applyDrawerChange(filters, field, value);
    setFilters(next);
  };

  // Issue #141: opt-in NL → filter. Pre-fills form state for review; never runs
  // the search itself (setFilters/setTextQuery only update state + reset paging).
  const applyNlFilters = (
    nextFilters: BaseSchemaFilters,
    nextTextQuery: string,
    question: string,
  ) => {
    setFilters(nextFilters);
    setTextQuery(nextTextQuery);
    setNlQuestion(question);
  };

  const resetDrawerFilters = () => {
    // Reset only non-substring, non-core fields — a drawer reset must not
    // clear jurisdiction/decision_date, which live outside the drawer.
    const next = { ...filters };
    Object.keys(filters).forEach(field => {
      if (field !== "case_name" &&
          field !== "appeal_court_judges_names" &&
          field !== "offender_representative_name" &&
          !isCoreFilterField(field)) {
        delete (next as Record<string, unknown>)[field];
      }
    });
    setFilters(next);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <header className="flex flex-col gap-2">
        <Eyebrow tone="oxblood">Search</Eyebrow>
        <Headline as="h1" size="xs">Search by extracted data</Headline>
        <p className="max-w-2xl text-sm text-[color:var(--ink-soft)]">
          Filter judgments across the full extracted base schema. Combine
          structured filters with free-text search.
        </p>
      </header>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search case names, judges, charges, courts…"
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            className="flex-1"
            aria-label="Full-text search"
          />
          <NlFilterDialog onApply={applyNlFilters} />
        </div>

        <SubstringInputs
          caseName={filters.case_name}
          appealCourtJudgesNames={filters.appeal_court_judges_names}
          offenderRepresentativeName={filters.offender_representative_name}
          onChange={setSubstringFilter}
        />

        <ScopeFilters filters={filters} onChange={setFilters} />

        <QuickFilters
          filters={drawerFilters}
          onChange={setDrawerFilter}
          facetCounts={facetCounts}
          onTagQueryChange={onTagQueryChange}
        />

        <BaseFiltersDrawer
          filters={drawerFilters}
          onChange={setDrawerFilter}
          onReset={resetDrawerFilters}
          facetCounts={facetCounts}
          onTagQueryChange={onTagQueryChange}
        />
      </div>

      {/*
        Results feedback bar. Sticky at the top of the scrollable content area:
        the app's Navbar (components/navbar.tsx) is a flex sibling *outside*
        that scroll container (see AppLayoutWrapper), not inside it, so it
        never overlaps this bar — no top-* offset needed.
      */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--rule)] bg-[color:var(--parchment)] py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ViewToggle view={view} onChange={setView} />
            {/* In the statistics view the cohort line replaces this count. */}
            {view === "list" && (
              <p className="text-sm text-[color:var(--ink-soft)]">
                {isLoading
                  ? "Searching…"
                  : total === 0
                    ? "No results"
                    : `${total.toLocaleString()} judgment${total === 1 ? "" : "s"}`}
                {isFetching && !isLoading && " (updating…)"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && (
              <SaveAsCollectionDialog
                filters={filters}
                textQuery={textQuery}
                total={total}
                defaultName={nlQuestion ?? ""}
                disabled={isLoading || Boolean(error)}
              />
            )}
            {view === "list" && error && (
              <Button variant="ghost" size="sm" onClick={() => clearAll()}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      <ActiveFilterChips
        filters={filters}
        textQuery={textQuery}
        onRemove={removeFilter}
        onClearText={clearText}
        onClearAll={clearAll}
      />

      {/*
        The list query is disabled behind the statistics view but React Query
        keeps its last error, so every list-only surface below is gated on the
        view, not on `error` alone.
      */}
      {view === "list" && error && (
        <div role="alert">
        <ErrorCard
          title="Results could not be loaded"
          message="The extraction search did not return results. Your filters are still applied and nothing was lost. An unusual filter combination is the most common cause — reset the filters and add them back one at a time."
          onRetry={() => { void refetch(); }}
          retryLabel="Try again"
          secondaryAction={{ label: "Reset filters", onClick: () => clearAll() }}
        />
        </div>
      )}

      {view === "stats" && (
        <StatisticsView
          filters={filters}
          textQuery={textQuery}
          sampleSize={sampleSize}
          seed={seed}
          fields={statsFields}
          onSampling={(n) => setSampling(n)}
          onReshuffle={reshuffle}
          onFields={setStatsFields}
          onDrillBack={(patch) => {
            if (patch) setFilters({ ...filters, ...patch });
            setView("list");
          }}
        />
      )}

      {view === "list" && !error && (
        <ResultList
          rows={rows}
          isLoading={isLoading}
          hasActiveFilters={activeCount > 0 || textQuery.trim().length > 0}
          onClearAll={clearAll}
          urlState={{ filters, textQuery, page, nlQuestion }}
        />
      )}

      {view === "list" && total > pageSize && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalResults={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={() => undefined}
          showPageSizeSelector={false}
        />
      )}
    </div>
  );
}

/**
 * Placeholder for the filter bar and result list while the client component
 * reads its filter state out of the URL. Without it the route rendered a blank
 * screen on first paint.
 */
function ExtractionSearchPageSkeleton() {
  return (
    <div className="space-y-4 p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading extraction search…</span>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<ExtractionSearchPageSkeleton />}>
      <ExtractionSearchPage />
    </Suspense>
  );
}
