"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
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
  BaseSchemaFilters,
} from "@/types/base-schema-filter";
import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";

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
      out[field] = { kind: "numeric_range", min: value, max: value };
    } else if (typeof value === "object" && value !== null) {
      if ("min" in value || "max" in value) {
        out[field] = { kind: "numeric_range", min: value.min, max: value.max };
      } else if ("from" in value || "to" in value) {
        out[field] = { kind: "date_range", from: value.from, to: value.to };
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
      if (value.min === value.max) {
        (next as Record<string, unknown>)[field] = value.min;
      } else {
        (next as Record<string, unknown>)[field] = { min: value.min, max: value.max };
      }
      break;
    case "date_range":
      (next as Record<string, unknown>)[field] = { from: value.from, to: value.to };
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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Search by extracted data</h1>
        <p className="text-sm text-muted-foreground">
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
        </div>

        <SubstringInputs
          caseName={filters.case_name}
          appealCourtJudgesNames={filters.appeal_court_judges_names}
          offenderRepresentativeName={filters.offender_representative_name}
          onChange={setSubstringFilter}
          disabled={isLoading}
        />

        <BaseFiltersDrawer
          filters={drawerFilters}
          onChange={setDrawerFilter}
          onReset={resetDrawerFilters}
          disabled={isLoading}
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
