"use client";

import { SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActiveFilter {
  label: string;
  onClear: () => void;
}

interface ZeroResultsEmptyStateProps {
  /** The search query that produced zero results. */
  query: string;
  /** Active filters the user can clear individually. */
  activeFilters?: ActiveFilter[];
  /** Called when the user wants to clear all filters at once. */
  onClearAllFilters?: () => void;
  /** Called when the user clicks a sample query. */
  onSampleQuery?: (q: string) => void;
  /** Additional className for the root element. */
  className?: string;
}

/**
 * A purposeful empty state for zero-result searches.
 *
 * Shows:
 * - A bilingual (Polish + English) message naming the query.
 * - A short-query guard (<3 chars shows a different prompt).
 * - Active filter chips so the user can quickly clear them.
 * - Hard-coded sample queries for discovery.
 */

const SAMPLE_QUERIES = [
  "zasiedzenie nieruchomości",
  "wypadek przy pracy",
  "odszkodowanie za szkodę",
  "prawo do alimentów",
  "umowa o pracę rozwiązanie",
  "odpowiedzialność karna nieletnich",
  "unfair dismissal",
  "breach of contract damages",
];

export function ZeroResultsEmptyState({
  query,
  activeFilters = [],
  onClearAllFilters,
  onSampleQuery,
  className,
}: ZeroResultsEmptyStateProps): React.JSX.Element {
  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;

  if (tooShort) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-16 px-6 text-center",
          className
        )}
        role="status"
        aria-live="polite"
      >
        <div className="rounded-full bg-muted/50 p-4 mb-5">
          <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          Wpisz więcej znaków, aby wyszukać / Type more to search
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Wyszukiwanie wymaga minimum 3 znaków.
          <br />
          Search requires at least 3 characters.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      <div className="rounded-full bg-muted/50 p-4 mb-5">
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>

      {/* Bilingual title */}
      <h3 className="text-xl font-semibold mb-2">
        Brak wyników / No results
      </h3>

      {/* Bilingual description with query */}
      <p className="text-sm text-muted-foreground mb-1 max-w-md">
        Nie znaleziono wyników dla{" "}
        <span className="font-semibold text-foreground">&quot;{trimmed}&quot;</span>.
        {" "}Spróbuj:
      </p>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        No results for{" "}
        <span className="font-semibold text-foreground">&quot;{trimmed}&quot;</span>.
        {" "}Try:
      </p>

      {/* Suggestions list */}
      <ul className="text-sm text-muted-foreground mb-6 space-y-1 text-left max-w-xs">
        <li>• Shorter or more general keywords / Krótsze lub ogólniejsze słowa kluczowe</li>
        <li>• Switch language (PL ↔ EN) / Zmień język</li>
        {activeFilters.length > 0 && (
          <li>• Clear active filters below / Usuń aktywne filtry poniżej</li>
        )}
      </ul>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="mb-6 w-full max-w-sm">
          <p className="text-xs font-medium text-muted-foreground mb-2 text-left">
            Active filters / Aktywne filtry:
          </p>
          <div className="flex flex-wrap gap-2 justify-start">
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                onClick={filter.onClear}
                aria-label={`Remove filter: ${filter.label}`}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full",
                  "text-xs font-medium",
                  "bg-primary/10 text-primary border border-primary/20",
                  "hover:bg-primary/20 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                )}
              >
                {filter.label}
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
            {onClearAllFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAllFilters}
                className="text-xs h-auto py-1 px-2.5"
              >
                Clear all / Wyczyść wszystkie
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sample queries */}
      <div className="w-full max-w-md">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Try a sample query / Spróbuj przykładowego zapytania:
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SAMPLE_QUERIES.map((sq) => (
            <button
              key={sq}
              onClick={() => onSampleQuery?.(sq)}
              aria-label={`Search for: ${sq}`}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium",
                "bg-white/60 backdrop-blur-sm",
                "border border-slate-200/60 text-slate-700",
                "hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
                "transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                "cursor-pointer"
              )}
            >
              {sq}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
