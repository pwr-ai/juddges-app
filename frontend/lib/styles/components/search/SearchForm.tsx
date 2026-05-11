"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeHighlightHtml } from "@/lib/highlight";
import type { AutocompleteSuggestion } from "@/hooks/useSearchAutocomplete";

type SearchMode = "thinking" | "rabbit";

export interface SearchFormProps {
  query: string;
  setQuery: (value: string) => void;
  searchType: SearchMode;
  setSearchType: (value: SearchMode) => void;
  selectedLanguages: Set<string>;
  toggleLanguage: (language: string) => void;
  setSelectedLanguages: (languages: Set<string>) => void;
  isSearching: boolean;
  hasResults: boolean;
  hasError: boolean;
  hasPerformedSearch: boolean;
  onSearch: (mode?: SearchMode) => void;
  autocompleteSuggestions?: AutocompleteSuggestion[];
  isAutocompleteLoading?: boolean;
  onSelectAutocompleteSuggestion?: (value: string) => void;
}

type PopularSearch = {
  label: string;
  mode: SearchMode;
  languages: Set<string>;
};

const POPULAR_SEARCHES: PopularSearch[] = [
  {
    label: "Kredyty frankowe",
    mode: "thinking",
    languages: new Set(["pl"]),
  },
  {
    label: "Intellectual property",
    mode: "thinking",
    languages: new Set(["uk"]),
  },
  {
    label: "Prawo pracy",
    mode: "thinking",
    languages: new Set(["pl"]),
  },
];

export const SearchForm = forwardRef<HTMLInputElement, SearchFormProps>(function SearchForm(
  {
    query,
    setQuery,
    setSearchType,
    setSelectedLanguages,
    isSearching,
    hasResults,
    hasError,
    hasPerformedSearch,
    onSearch,
    autocompleteSuggestions = [],
    isAutocompleteLoading = false,
    onSelectAutocompleteSuggestion,
  },
  forwardedRef
): React.JSX.Element {
  const internalRef = useRef<HTMLInputElement>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const setInputRef = (node: HTMLInputElement | null): void => {
    internalRef.current = node;
    if (!forwardedRef) {
      return;
    }
    if (typeof forwardedRef === "function") {
      forwardedRef(node);
      return;
    }
    forwardedRef.current = node;
  };

  const handleSubmit = (event?: React.FormEvent): void => {
    if (event) {
      event.preventDefault();
    }
    if (!query.trim()) {
      return;
    }
    onSearch();
  };

  const handlePopularSearch = (item: PopularSearch): void => {
    setQuery(item.label);
    setSearchType(item.mode);
    setSelectedLanguages(item.languages);
    internalRef.current?.focus();
  };

  const showPopularSearches = !hasPerformedSearch && !hasResults && !hasError;
  const showSuggestions =
    query.trim().length >= 2 &&
    !isSearching &&
    (isAutocompleteLoading || autocompleteSuggestions.length > 0);

  const handleSuggestionSelect = (suggestion: string): void => {
    if (onSelectAutocompleteSuggestion) {
      onSelectAutocompleteSuggestion(suggestion);
    } else {
      setQuery(suggestion);
    }
    internalRef.current?.focus();
  };

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [query, autocompleteSuggestions.length, isAutocompleteLoading]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showSuggestions || autocompleteSuggestions.length === 0 || isAutocompleteLoading) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, autocompleteSuggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      const selected = autocompleteSuggestions[activeSuggestionIndex];
      if (selected) {
        handleSuggestionSelect(selected.title);
      }
      return;
    }

    if (event.key === "Escape") {
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border bg-background/80 px-4 py-3 ${hasError ? "pb-2" : ""}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          ref={setInputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Liability for defective construction works in Poland"
          disabled={isSearching}
          className="h-11"
          maxLength={2000}
          aria-describedby="search-char-counter"
        />
        <Button
          type="submit"
          disabled={isSearching || !query.trim() || query.length > 2000}
          className="h-11 min-w-[112px]"
          aria-label="Search"
        >
          <Search className="mr-1 h-4 w-4" />
          Search
        </Button>
      </div>
      {query.length >= 1500 && (
        <div
          id="search-char-counter"
          className={`mt-1 text-right text-xs ${
            query.length >= 2000
              ? "text-destructive font-medium"
              : "text-muted-foreground"
          }`}
          aria-live="polite"
        >
          {query.length} / 2000 characters
          {query.length >= 2000 && " — maximum reached"}
        </div>
      )}

      {showSuggestions && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-background/60 p-2">
          <div className="px-1 text-xs text-muted-foreground">Suggestions</div>
          {isAutocompleteLoading ? (
            <p className="px-1 text-sm text-muted-foreground">Loading suggestions...</p>
          ) : (
            <div role="listbox" aria-label="Autocomplete suggestions" className="space-y-1">
              {autocompleteSuggestions.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                    index === activeSuggestionIndex ? "bg-muted" : ""
                  }`}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => handleSuggestionSelect(item.title)}
                  aria-label={`Use suggestion: ${item.title}`}
                >
                  <div className="font-medium" dangerouslySetInnerHTML={{ __html: sanitizeHighlightHtml(item.title) }} />
                  {(item.caseNumber || item.courtName) ? (
                    <div className="text-xs text-muted-foreground">
                      {[item.caseNumber, item.courtName, item.decisionDate].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                  {item.summary ? (
                    <div className="text-xs text-muted-foreground line-clamp-1" dangerouslySetInnerHTML={{ __html: sanitizeHighlightHtml(item.summary) }} />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showPopularSearches && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Popular searches</span>
          {POPULAR_SEARCHES.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handlePopularSearch(item)}
              className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </form>
  );
});
