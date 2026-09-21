/**
 * Search Filters Component
 * Filter sidebar for search results with keywords, document types, dates, etc.
 * Used in search page to filter search results
 */

"use client";

import React from "react";
import { Badge, Button, Calendar, AdvancedFilterPanel } from "@/lib/styles/components";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import { cn, formatSnakeCaseToHumanReadable } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { VariantButton } from "@/lib/styles/components";


interface FiltersState {
 keywords: Set<string>;
 legalConcepts: Set<string>;
 issuingBodies: Set<string>;
 languages: Set<string>;
 dateFrom: Date | undefined;
 dateTo: Date | undefined;
 jurisdictions: Set<string>;
 courtLevels: Set<string>;
 legalDomains: Set<string>;
 customMetadata: Record<string, string[]>;
}

interface AvailableFilters {
 keywords: string[];
 legalConcepts: string[];
 issuingBodies: string[];
 languages: string[];
 jurisdictions: string[];
 courtLevels: string[];
 legalDomains: string[];
 customMetadataKeys: string[];
}

export interface SearchFiltersProps {
 filters: FiltersState;
 availableFilters: AvailableFilters;
 onFilterToggle: (filterType: keyof FiltersState, value: string) => void;
 onDateChange: (type: 'dateFrom' | 'dateTo', value?: Date) => void;
 onResetFilters: () => void;
 activeFilterCount: number;
 searchResults?: { documents: Array<{
 keywords?: string[] | null;
 language?: string | null;
 jurisdiction?: string | null;
 court_level?: string | null;
 legal_domain?: string | null;
 custom_metadata?: Record<string, string | string[] | number | boolean | null> | null;
 }> } | null;
 /** Callbacks for custom metadata filters */
 onCustomMetadataToggle?: (key: string, value: string) => void;
 onClearCustomMetadata?: (key: string) => void;
 /** Custom metadata values available for each key */
 customMetadataValues?: Record<string, string[]>;
}

// Date range input component
const DateRangeInput = ({ label, date, onSelect, minDate, maxDate }: {
 label: string;
 date?: Date;
 onSelect: (date: Date | undefined) => void;
 minDate?: Date;
 maxDate?: Date;
}): React.JSX.Element => {
 const handleSelect = (selectedDate: Date | DateRange | undefined): void => {
 // Since mode="single", we only expect Date | undefined
 if (selectedDate instanceof Date || selectedDate === undefined) {
 onSelect(selectedDate);
 }
 };

  return (
    <div>
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start text-left font-mono text-xs rounded-none transition-colors",
              "bg-parchment text-ink border-rule",
              "hover:bg-parchment-deep hover:border-ink",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
              !date ? "text-muted-foreground" : "text-ink font-medium"
            )}
            aria-label={`${label} date picker${date ? `: ${format(date, "MMM yyyy")}` : ""}`}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {date ? format(date, "MMM yyyy") : "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 rounded-none border-rule bg-parchment shadow-sm"
          align="start"
        >
          <Calendar
            mode="single"
            precision="month"
            selected={date}
            onSelect={handleSelect}
            minDate={minDate}
            maxDate={maxDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export function SearchFilters({
 filters,
 availableFilters,
 onFilterToggle,
 onDateChange,
 onResetFilters,
 activeFilterCount,
 searchResults,
 onCustomMetadataToggle,
 onClearCustomMetadata,
 customMetadataValues,
}: SearchFiltersProps): React.JSX.Element {
 // Calculate keyword counts and filter/sort
 const keywordCounts = searchResults?.documents
 ? availableFilters.keywords
 .map(keyword => {
 const count = searchResults.documents.filter(doc =>
 doc.keywords?.includes(keyword)
 ).length;
 return { keyword, count };
 })
 .filter(({ count }) => count > 1) // Filter out keywords with only 1 result
 .sort((a, b) => b.count - a.count) // Sort by count descending
 .map(({ keyword }) => keyword)
 : availableFilters.keywords;

 // Calculate language counts and filter/sort
 const languageCounts = searchResults?.documents
 ? availableFilters.languages
 .map(lang => {
 const count = searchResults.documents.filter(doc =>
 doc.language === lang
 ).length;
 return { lang, count };
 })
 .filter(({ count }) => count > 0) // Only show languages with at least 1 result
 .sort((a, b) => b.count - a.count) // Sort by count descending
 .map(({ lang }) => lang)
 : availableFilters.languages;
  return (
    <div className="sticky top-4 space-y-4">
      {/* Editorial header */}
      <div className="flex items-center justify-between pb-3 border-b border-rule">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-ink font-semibold">
            Filters
          </h2>
          {activeFilterCount > 0 && (
            <Badge className="bg-parchment-deep text-ink border-rule font-mono text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </div>

        {activeFilterCount > 0 && (
          <VariantButton
            intent="accent"
            onClick={onResetFilters}
            icon={X}
            size="sm"
          >
            Clear all
          </VariantButton>
        )}
      </div>

      <div className="space-y-4">
        {/* Date Range Filter */}
        <div className="border border-rule rounded-none p-3 bg-parchment space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Date Range
          </h3>
          <div className="space-y-2">
            <DateRangeInput
              label="From"
              date={filters.dateFrom}
              onSelect={(date) => onDateChange('dateFrom', date)}
              maxDate={filters.dateTo} // FROM cannot be after TO
            />
            <DateRangeInput
              label="To"
              date={filters.dateTo}
              onSelect={(date) => onDateChange('dateTo', date)}
              minDate={filters.dateFrom} // TO cannot be before FROM
            />
          </div>
        </div>

        {/* Language filter - Only show if there are languages with results */}
        {languageCounts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Language
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {languageCounts.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-none text-xs font-mono transition-colors border",
                    filters.languages?.has(lang)
                      ? "bg-ink text-parchment border-ink font-medium"
                      : "bg-parchment text-ink border-rule hover:bg-parchment-deep hover:border-rule-strong"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onFilterToggle('languages', lang);
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keywords filter - Only show if there are keywords */}
        {keywordCounts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Keywords
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {keywordCounts.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-none text-xs font-mono transition-colors border",
                    filters.keywords.has(keyword)
                      ? "bg-ink text-parchment border-ink font-medium"
                      : "bg-parchment text-ink border-rule hover:bg-parchment-deep hover:border-rule-strong"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterToggle('keywords', keyword);
                  }}
                >
                  {formatSnakeCaseToHumanReadable(keyword)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Issuing bodies filter - Only show if there are issuing bodies */}
        {availableFilters.issuingBodies.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Issuing Bodies
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {availableFilters.issuingBodies.map((body) => (
                <button
                  key={body}
                  type="button"
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-none text-xs font-mono transition-colors border",
                    filters.issuingBodies.has(body)
                      ? "bg-ink text-parchment border-ink font-medium"
                      : "bg-parchment text-ink border-rule hover:bg-parchment-deep hover:border-rule-strong"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterToggle('issuingBodies', body);
                  }}
                >
                  {formatSnakeCaseToHumanReadable(body)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Legal concepts filter - Only show if there are legal concepts */}
        {availableFilters.legalConcepts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Legal Concepts
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {availableFilters.legalConcepts.map((concept) => (
                <button
                  key={concept}
                  type="button"
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-none text-xs font-mono transition-colors border",
                    filters.legalConcepts.has(concept)
                      ? "bg-ink text-parchment border-ink font-medium"
                      : "bg-parchment text-ink border-rule hover:bg-parchment-deep hover:border-rule-strong"
                  )}
                  onClick={() => onFilterToggle('legalConcepts', concept)}
                >
                  {concept}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advanced Filters (Jurisdiction, Court Level, Legal Domain, Custom Metadata) */}
        <AdvancedFilterPanel
          filters={filters}
          availableFilters={availableFilters}
          onFilterToggle={onFilterToggle}
          onCustomMetadataToggle={onCustomMetadataToggle || (() => {})}
          onClearCustomMetadata={onClearCustomMetadata || (() => {})}
          searchResults={searchResults}
          customMetadataValues={customMetadataValues}
        />
      </div>
    </div>
  );
}
