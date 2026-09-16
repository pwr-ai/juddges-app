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
        <div className="border border-rule bg-card p-3 mb-4 w-10 h-10 flex items-center justify-center">
          <SearchX className="h-4 w-4 text-ink" aria-hidden="true" />
        </div>
        <h3 className="font-serif font-medium text-lg sm:text-xl text-ink mb-2 text-center">
          Wpisz więcej znaków, aby wyszukać / Type more to search
        </h3>
        <p className="text-sm text-ink-soft max-w-sm">
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
      <div className="border border-rule bg-card p-3 mb-4 w-10 h-10 flex items-center justify-center">
        <SearchX className="h-4 w-4 text-ink" aria-hidden="true" />
      </div>

      {/* Bilingual title */}
      <h3 className="font-serif font-medium text-lg sm:text-xl text-ink mb-2 text-center">
        Brak wyników / No results
      </h3>

      {/* Bilingual description with query */}
      <p className="text-sm text-ink-soft mb-1 max-w-md">
        Nie znaleziono wyników dla{" "}
        <span className="font-semibold text-ink">&quot;{trimmed}&quot;</span>.
        {" "}Spróbuj:
      </p>
      <p className="text-sm text-ink-soft mb-6 max-w-md">
        No results for{" "}
        <span className="font-semibold text-ink">&quot;{trimmed}&quot;</span>.
        {" "}Try:
      </p>

      {/* Suggestions list */}
      <ul className="text-sm text-ink-soft mb-6 space-y-1 text-left max-w-xs">
        <li>• Shorter or more general keywords / Krótsze lub ogólniejsze słowa kluczowe</li>
        <li>• Switch language (PL ↔ EN) / Zmień język</li>
        {activeFilters.length > 0 && (
          <li>• Clear active filters below / Usuń aktywne filtry poniżej</li>
        )}
      </ul>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="mb-6 w-full max-w-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-2 text-left">
            Active filters / Aktywne filtry:
          </p>
          <div className="flex flex-wrap gap-2 justify-start">
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                onClick={filter.onClear}
                aria-label={`Remove filter: ${filter.label}`}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-none",
                  "font-mono text-xs",
                  "bg-parchment-deep text-ink border border-rule",
                  "hover:border-oxblood hover:text-oxblood transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
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
                className="font-mono text-xs h-auto py-1 px-2.5 rounded-none text-ink-soft hover:text-oxblood"
              >
                Clear all / Wyczyść wszystkie
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sample queries */}
      <div className="w-full max-w-md">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-3">
          Try a sample query / Spróbuj przykładowego zapytania:
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SAMPLE_QUERIES.map((sq) => (
            <button
              key={sq}
              onClick={() => onSampleQuery?.(sq)}
              aria-label={`Search for: ${sq}`}
              className={cn(
                "px-3 py-1.5 rounded-none font-mono text-xs",
                "bg-parchment-deep border border-rule text-ink",
                "hover:border-oxblood hover:text-oxblood",
                "transition-colors duration-150 cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
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
