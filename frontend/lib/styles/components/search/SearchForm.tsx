"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow, Rule } from "@/components/editorial";
import type { AutocompleteSuggestion, TopicHit } from "@/hooks/useSearchAutocomplete";
import { pickTopicLabel } from "@/hooks/useSearchAutocomplete";
import { postTopicClick } from "@/lib/api/topics";

type SearchMode = "thinking" | "rabbit";

/**
 * Sanitize HTML from Meilisearch highlights: allow only mark tags via DOMPurify.
 */
function sanitizeHighlight(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["mark"],
    ALLOWED_ATTR: [],
  });
}

/** Derive a displayable formatted string for a topic field, handling string|string[] from _formatted. */
function getFormattedField(raw: string, formatted: string | string[] | undefined): string {
  if (!formatted) return raw;
  if (Array.isArray(formatted)) return formatted.join(", ");
  return formatted;
}

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
  autocompleteTopicHits?: TopicHit[];
  isAutocompleteLoading?: boolean;
  onSelectAutocompleteSuggestion?: (value: string) => void;
  /** BCP-47 locale tag used to pick primary/secondary topic labels. Defaults to "en". */
  currentLocale?: string;
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
    autocompleteTopicHits = [],
    isAutocompleteLoading = false,
    onSelectAutocompleteSuggestion,
    currentLocale = "en",
  },
  forwardedRef
): React.JSX.Element {
  const router = useRouter();
  const internalRef = useRef<HTMLInputElement>(null);
  // Combined flat index: topics first, then judgment suggestions
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const totalItems = autocompleteTopicHits.length + autocompleteSuggestions.length;

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
    (isAutocompleteLoading || autocompleteTopicHits.length > 0 || autocompleteSuggestions.length > 0);

  const handleSuggestionSelect = (suggestion: string): void => {
    if (onSelectAutocompleteSuggestion) {
      onSelectAutocompleteSuggestion(suggestion);
    } else {
      setQuery(suggestion);
    }
    internalRef.current?.focus();
  };

  /** Navigate to a topic chip URL and fire analytics. */
  const handleTopicSelect = useCallback(
    (hit: TopicHit): void => {
      const { primary } = pickTopicLabel(hit, currentLocale);
      const params = new URLSearchParams({ q: primary, topic: hit.id });

      // Fire-and-forget analytics
      postTopicClick({
        topic_id: hit.id,
        query,
        jurisdiction: null,
      });

      router.push(`/search?${params.toString()}`);
    },
    [currentLocale, query, router]
  );

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [query, autocompleteTopicHits.length, autocompleteSuggestions.length, isAutocompleteLoading]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!showSuggestions || totalItems === 0 || isAutocompleteLoading) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, totalItems - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      if (activeSuggestionIndex < autocompleteTopicHits.length) {
        // Focused on a topic
        const hit = autocompleteTopicHits[activeSuggestionIndex];
        if (hit) handleTopicSelect(hit);
      } else {
        // Focused on a judgment suggestion
        const suggestionIndex = activeSuggestionIndex - autocompleteTopicHits.length;
        const selected = autocompleteSuggestions[suggestionIndex];
        if (selected) {
          handleSuggestionSelect(selected.title);
        }
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
        <div className="mt-3 rounded-lg border border-[color:var(--rule)] bg-background/60 p-2">
          {isAutocompleteLoading ? (
            <p className="px-1 text-sm text-muted-foreground">Loading suggestions...</p>
          ) : (
            <>
              {/* TOPICS section */}
              {autocompleteTopicHits.length > 0 && (
                <div className="mb-1">
                  <div className="px-1 pt-1 pb-0.5">
                    <Eyebrow noRule as="div">Topics</Eyebrow>
                  </div>
                  <div role="listbox" aria-label="Topic suggestions">
                    {autocompleteTopicHits.map((hit, index) => {
                      const { primary, secondary } = pickTopicLabel(hit, currentLocale);
                      const lang = currentLocale.split("-")[0].toLowerCase();
                      const formattedPrimary =
                        lang === "pl"
                          ? getFormattedField(hit.label_pl, hit._formatted?.label_pl as string | string[] | undefined)
                          : getFormattedField(hit.label_en, hit._formatted?.label_en as string | string[] | undefined);
                      const isActive = index === activeSuggestionIndex;

                      return (
                        <button
                          key={hit.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={[
                            "group w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                            "hover:bg-[color:var(--gold-soft)] hover:text-[color:var(--oxblood)]",
                            "[&_mark]:bg-[color:var(--gold)] [&_mark]:text-[color:var(--ink)]",
                            isActive ? "bg-[color:var(--gold-soft)] text-[color:var(--oxblood)]" : "",
                          ].join(" ")}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onClick={() => handleTopicSelect(hit)}
                          aria-label={`Topic: ${primary}`}
                        >
                          <span className="flex items-center gap-1 min-w-0">
                            <span
                              className="font-medium truncate"
                              // DOMPurify-sanitized Meilisearch highlight HTML (only <mark> tags allowed)
                              dangerouslySetInnerHTML={{ __html: sanitizeHighlight(formattedPrimary) }}
                            />
                            {secondary && (
                              <>
                                <span className="text-[color:var(--ink-soft)] shrink-0">·</span>
                                <span className="text-[color:var(--ink-soft)] text-xs truncate">
                                  {secondary}
                                </span>
                              </>
                            )}
                          </span>
                          <span
                            className="ml-2 shrink-0 font-mono text-xs tabular-nums text-[color:var(--ink-soft)]"
                            aria-label={`${hit.doc_count} documents`}
                          >
                            ({hit.doc_count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider between sections — only when both are non-empty */}
              {autocompleteTopicHits.length > 0 && autocompleteSuggestions.length > 0 && (
                <Rule className="my-1" />
              )}

              {/* JUDGMENTS section */}
              {autocompleteSuggestions.length > 0 && (
                <div>
                  <div className="px-1 pt-1 pb-0.5">
                    <Eyebrow noRule as="div">Judgments</Eyebrow>
                  </div>
                  <div role="listbox" aria-label="Autocomplete suggestions" className="space-y-1">
                    {autocompleteSuggestions.map((item, index) => {
                      const flatIndex = autocompleteTopicHits.length + index;
                      const isActive = flatIndex === activeSuggestionIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted [&_mark]:bg-[color:var(--gold)] [&_mark]:text-[color:var(--ink)] ${
                            isActive ? "bg-muted" : ""
                          }`}
                          onMouseEnter={() => setActiveSuggestionIndex(flatIndex)}
                          onClick={() => handleSuggestionSelect(item.title)}
                          aria-label={`Use suggestion: ${item.title}`}
                        >
                          <div
                            className="font-medium"
                            // DOMPurify-sanitized Meilisearch highlight HTML (only <mark> tags allowed)
                            dangerouslySetInnerHTML={{ __html: sanitizeHighlight(item.title) }}
                          />
                          {(item.caseNumber || item.courtName) ? (
                            <div className="text-xs text-muted-foreground">
                              {[item.caseNumber, item.courtName, item.decisionDate].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                          {item.summary ? (
                            <div
                              className="text-xs text-muted-foreground line-clamp-1"
                              // DOMPurify-sanitized Meilisearch highlight HTML (only <mark> tags allowed)
                              dangerouslySetInnerHTML={{ __html: sanitizeHighlight(item.summary) }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
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
