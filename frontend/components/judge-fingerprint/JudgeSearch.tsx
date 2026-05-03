'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, Loader2, X, UserRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { searchJudges } from '@/lib/api/judge-fingerprint';
import type { JudgeSearchResult } from '@/types/judge-fingerprint';
import { Badge } from '@/lib/styles/components';

interface JudgeSearchProps {
  /** Currently selected judge names */
  selectedJudges: string[];
  /** Called when a judge is added to selection */
  onSelectJudge: (name: string) => void;
  /** Called when a judge is removed from selection */
  onRemoveJudge: (name: string) => void;
  /** Maximum number of judges that can be selected */
  maxSelections?: number;
}

/** Debounce hook for search input */
function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function JudgeSearch({
  selectedJudges,
  onSelectJudge,
  onRemoveJudge,
  maxSelections = 3,
}: JudgeSearchProps) {
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch search results when the debounced query changes
  const { data, isLoading } = useQuery({
    queryKey: ['judge-search', debouncedQuery],
    queryFn: () => searchJudges(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Filter out already-selected judges from the dropdown
  const filteredResults: JudgeSearchResult[] = (data?.judges ?? []).filter(
    (j) => !selectedJudges.includes(j.name)
  );

  const handleSelect = useCallback(
    (name: string) => {
      if (selectedJudges.length >= maxSelections) return;
      onSelectJudge(name);
      setQuery('');
      setIsDropdownOpen(false);
      inputRef.current?.focus();
    },
    [selectedJudges, maxSelections, onSelectJudge]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canAddMore = selectedJudges.length < maxSelections;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border/50 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
          {isLoading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => {
              if (debouncedQuery.length >= 2) setIsDropdownOpen(true);
            }}
            placeholder={
              canAddMore
                ? 'Wyszukaj sedziego po nazwisku...'
                : `Maksymalnie ${maxSelections} sedziow`
            }
            disabled={!canAddMore}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Dropdown results */}
        {isDropdownOpen && debouncedQuery.length >= 2 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg bg-background border border-border shadow-lg">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Szukanie...
              </div>
            )}

            {!isLoading && filteredResults.length === 0 && (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                Nie znaleziono sedziow pasujacych do &quot;{debouncedQuery}&quot;
              </div>
            )}

            {!isLoading &&
              filteredResults.map((judge) => (
                <button
                  key={judge.name}
                  onClick={() => handleSelect(judge.name)}
                  className="flex items-center justify-between w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <UserRound className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-foreground truncate">{judge.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                    {judge.case_count} spraw
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Selected judges pills */}
      {selectedJudges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedJudges.map((name) => (
            <Badge
              key={name}
              variant="secondary"
              className="text-xs flex items-center gap-1.5 pr-1 py-1"
            >
              <UserRound className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{name}</span>
              <button
                onClick={() => onRemoveJudge(name)}
                className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
                aria-label={`Usun ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Wyszukaj do {maxSelections} sedziow, aby wyswietlic ich profil rozumowania.
        Wybierz 2-3, aby porownac.
      </p>
    </div>
  );
}
