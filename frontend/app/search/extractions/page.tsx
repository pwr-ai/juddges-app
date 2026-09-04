"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
import { NlFilterDialog } from "@/components/search/NlFilterDialog";
import { QuickFilters } from "@/components/search/QuickFilters";
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
import type {
  BaseSchemaFilterRequest,
  BaseSchemaFilterResultRow,
  BaseSchemaFilters,
} from "@/types/base-schema-filter";
import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";

const pageLogger = logger.child("ExtractionSearchPage");

// =============================================================================
// Adapter: BaseSchemaFilters (PG RPC) ↔ BaseFilters (drawer's union)
// =============================================================================

function toDrawerFilters(s: BaseSchemaFilters): BaseFilters {
  const out: BaseFilters = {};
  for (const [field, value] of Object.entries(s)) {
    if (value === undefined || value === null) continue;

    // Skip substring fields - they're handled separately above the drawer
    if (field === "case_name" ||
        field === "appeal_court_judges_names" ||
        field === "offender_representative_name") {
      continue;
    }

    // Convert to BaseFilterValue shape based on value type
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      // Could be enum_multi or tag_array - both use array format
      out[field] = { kind: "tag_array", values: value };
    } else if (typeof value === "boolean") {
      out[field] = { kind: "boolean_tri", value };
    } else if (typeof value === "number") {
      out[field] = { kind: "numeric_range", range: { min: value, max: value } };
    } else if (typeof value === "object" && value !== null) {
      if ("min" in value || "max" in value) {
        out[field] = {
          kind: "numeric_range",
          range: {
            min: (value as { min?: number }).min,
            max: (value as { max?: number }).max,
          },
        };
      } else if ("from" in value || "to" in value) {
        out[field] = {
          kind: "date_range",
          range: {
            min: (value as { from?: number }).from,
            max: (value as { to?: number }).to,
          },
        };
      }
    }
  }
  return out;
}

function applyDrawerChange(
  s: BaseSchemaFilters,
  field: string,
  value: BaseFilterValue | undefined,
): BaseSchemaFilters {
  const next = { ...s };

  if (value === undefined) {
    delete (next as Record<string, unknown>)[field];
    return next;
  }

  // Convert back to BaseSchemaFilters shape
  switch (value.kind) {
    case "tag_array":
    case "enum_multi":
      (next as Record<string, unknown>)[field] = value.values;
      break;
    case "boolean_tri":
      (next as Record<string, unknown>)[field] = value.value;
      break;
    case "numeric_range":
      if (value.range.min === value.range.max && value.range.min !== undefined) {
        (next as Record<string, unknown>)[field] = value.range.min;
      } else {
        (next as Record<string, unknown>)[field] = {
          min: value.range.min,
          max: value.range.max,
        };
      }
      break;
    case "date_range":
      (next as Record<string, unknown>)[field] = {
        from: value.range.min,
        to: value.range.max,
      };
      break;
  }

  return next;
}

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

function ResultRow({ row }: { row: BaseSchemaFilterResultRow }) {
  const date = row.decision_date ? new Date(row.decision_date) : null;
  return (
    <Link
      href={`/judgments/${row.id}`}
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

function ResultList({
  rows,
  isLoading,
  hasActiveFilters,
  onClearAll,
}: {
  rows: BaseSchemaFilterResultRow[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  onClearAll: () => void;
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
        {hasActiveFilters && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onClearAll}>
            Clear all filters
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ResultRow key={row.id} row={row} />
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
    removeFilter,
    clearAll,
    activeCount,
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

  const { data, isLoading, isFetching, error, refetch } = useExtractionResults(request);

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
  ) => {
    setFilters(nextFilters);
    setTextQuery(nextTextQuery);
  };

  const resetDrawerFilters = () => {
    // Reset only non-substring fields
    const next = { ...filters };
    Object.keys(filters).forEach(field => {
      if (field !== "case_name" &&
          field !== "appeal_court_judges_names" &&
          field !== "offender_representative_name") {
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
          <p className="text-sm text-[color:var(--ink-soft)]">
            {isLoading
              ? "Searching…"
              : total === 0
                ? "No results"
                : `${total.toLocaleString()} judgment${total === 1 ? "" : "s"}`}
            {isFetching && !isLoading && " (updating…)"}
          </p>
          {error && (
            <Button variant="ghost" size="sm" onClick={() => clearAll()}>
              Reset
            </Button>
          )}
        </div>
      </div>

      <ActiveFilterChips
        filters={filters}
        textQuery={textQuery}
        onRemove={removeFilter}
        onClearText={clearText}
        onClearAll={clearAll}
      />

      {error && (
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

      {!error && (
        <ResultList
          rows={rows}
          isLoading={isLoading}
          hasActiveFilters={activeCount > 0 || textQuery.trim().length > 0}
          onClearAll={clearAll}
        />
      )}

      {total > pageSize && (
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
