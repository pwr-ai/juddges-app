"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";

import {
  ActiveFilterChips,
  ExtractedFilterDrawer,
} from "@/components/filters/extracted-search-filters";
import { Pagination } from "@/lib/styles/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useExtractionResults } from "@/lib/extractions/base-schema-filter-api";
import { useExtractedDataFilters } from "@/lib/extractions/use-extracted-data-filters";
import type {
  BaseSchemaFilterRequest,
  BaseSchemaFilterResultRow,
} from "@/types/base-schema-filter";

function ResultRow({ row }: { row: BaseSchemaFilterResultRow }) {
  const date = row.decision_date ? new Date(row.decision_date) : null;
  return (
    <Link
      href={`/judgments/${row.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight truncate">
            {row.title ?? row.case_number ?? row.id}
          </h3>
          {row.case_number && row.title && (
            <p className="mt-0.5 text-xs text-muted-foreground">
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
}: {
  rows: BaseSchemaFilterResultRow[];
  isLoading: boolean;
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
          No judgments match the current filters.
        </p>
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

  const { data, isLoading, isFetching, error } = useExtractionResults(request);
  const rows = data?.documents ?? [];
  const total = data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const clearText = () => setTextQuery("");

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Search by extracted data</h1>
        <p className="text-sm text-muted-foreground">
          Filter judgments across the full extracted base schema. Combine
          structured filters with free-text search.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search case names, judges, charges, courts…"
          value={textQuery}
          onChange={(e) => setTextQuery(e.target.value)}
          className="flex-1"
          aria-label="Full-text search"
        />
        <ExtractedFilterDrawer
          filters={filters}
          onChange={setFilters}
          activeCount={activeCount}
        />
      </div>

      <ActiveFilterChips
        filters={filters}
        textQuery={textQuery}
        onRemove={removeFilter}
        onClearText={clearText}
        onClearAll={clearAll}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
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

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <ResultList rows={rows} isLoading={isLoading} />

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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExtractionSearchPage />
    </Suspense>
  );
}
