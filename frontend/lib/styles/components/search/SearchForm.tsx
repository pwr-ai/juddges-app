"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/editorial";
import { sanitizeHighlightHtml } from "@/lib/highlight";
import type { TopicHit } from "@/hooks/useSearchAutocomplete";
import { pickTopicLabel } from "@/hooks/useSearchAutocomplete";
import { postTopicClick } from "@/lib/api/topics";

type SearchMode = "thinking" | "rabbit";

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
  onSearch: (mode?: SearchMode, overrideQuery?: string) => void;
  autocompleteTopicHits?: TopicHit[];
  isAutocompleteLoading?: boolean;
  /** BCP-47 locale tag used to pick primary/secondary topic labels. Defaults to "en". */
  currentLocale?: string;
}

type SuggestedTopic =
  | {
      id: string;
      kind: "dual";
      pl: { label: string };
      en: { label: string };
    }
  | {
      id: string;
      kind: "single";
      label: string;
    };

const SUGGESTED_TOPICS: SuggestedTopic[] = [
  {
    id: "drug-possession",
    kind: "dual",
    pl: { label: "Posiadanie narkotyków" },
    en: { label: "Drug possession" },
  },
  {
    id: "drug-distribution",
    kind: "dual",
    pl: { label: "Wprowadzanie narkotyków do obrotu" },
    en: { label: "Drug supply and distribution" },
  },
  {
    id: "significant-quantity",
    kind: "dual",
    pl: { label: "Znaczna ilość narkotyków" },
    en: { label: "Class A drug offences" },
  },
  {
    id: "supply-to-minors",
    kind: "dual",
    pl: { label: "Udzielanie narkotyków małoletnim" },
    en: { label: "Supplying drugs to minors" },
  },
  {
    id: "sentencing",
    kind: "dual",
    pl: { label: "Wymiar kary za przestępstwa narkotykowe" },
    en: { label: "Sentencing for drug offences" },
  },
  {
    id: "recidivism",
    kind: "dual",
    pl: { label: "Recydywa przy przestępstwach narkotykowych" },
    en: { label: "Sentencing uplift for repeat drug offenders" },
  },
  {
    id: "money-laundering",
    kind: "single",
    label: "Money laundering from drug proceeds",
  },
  {
    id: "conspiracy",
    kind: "single",
    label: "Conspiracy to supply controlled drugs",
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
    autocompleteTopicHits = [],
    isAutocompleteLoading = false,
    currentLocale = "en",
  },
  forwardedRef
): React.JSX.Element {
  const internalRef = useRef<HTMLInputElement>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const totalItems = autocompleteTopicHits.length;

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

  const handleDualClick = (label: string, lang: "pl" | "uk"): void => {
    setQuery(label);
    setSearchType("thinking");
    setSelectedLanguages(new Set([lang]));
    internalRef.current?.focus();
  };

  const handleSingleClick = (label: string): void => {
    setQuery(label);
    setSearchType("thinking");
    setSelectedLanguages(new Set(["pl", "uk"]));
    internalRef.current?.focus();
  };

  const showPopularSearches = !hasPerformedSearch && !hasResults && !hasError;
  // Keep the dropdown mounted whenever the query is long enough so the user
  // sees loading + empty states (not just successful hit lists).
  const showSuggestions = query.trim().length >= 2 && !isSearching;

  /** Replace the input with the topic's primary label, fire analytics, and run search. */
  const handleTopicSelect = useCallback(
    (hit: TopicHit): void => {
      const { primary } = pickTopicLabel(hit, currentLocale);

      setQuery(primary);

      postTopicClick({
        topic_id: hit.id,
        query,
        jurisdiction: null,
      });

      onSearch(undefined, primary);
    },
    [currentLocale, onSearch, query, setQuery]
  );

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [query, autocompleteTopicHits.length, isAutocompleteLoading]);

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
      const hit = autocompleteTopicHits[activeSuggestionIndex];
      if (hit) handleTopicSelect(hit);
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
          ) : autocompleteTopicHits.length === 0 ? (
            <p className="px-1 py-1 text-sm text-muted-foreground">
              No matching topics — press <span className="font-medium">Search</span> to query judgments directly.
            </p>
          ) : (
            <div role="listbox" aria-label="Search suggestions">
              {autocompleteTopicHits.length > 0 && (
                <div>
                  <div className="px-1 pt-1 pb-0.5">
                    <Eyebrow noRule as="div">Topics</Eyebrow>
                  </div>
                  <div role="group" aria-label="Topics">
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
                            "w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
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
                              dangerouslySetInnerHTML={{ __html: sanitizeHighlightHtml(formattedPrimary) }}
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
            </div>
          )}
        </div>
      )}

      {showPopularSearches && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Popular searches</span>
          {SUGGESTED_TOPICS.map((topic) => {
            if (topic.kind === "dual") {
              return (
                <span
                  key={topic.id}
                  role="group"
                  aria-label={`Topic: ${topic.en.label}`}
                  className="inline-flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => handleDualClick(topic.pl.label, "pl")}
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    lang="pl"
                  >
                    {topic.pl.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDualClick(topic.en.label, "uk")}
                    className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    lang="en"
                  >
                    {topic.en.label}
                  </button>
                </span>
              );
            }
            // topic.kind === "single"
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleSingleClick(topic.label)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                lang="en"
                title="Searches Polish and UK judgments"
              >
                <span
                  aria-hidden="true"
                  className="mr-1 font-mono text-[10px] tracking-tight text-muted-foreground"
                >
                  [PL+UK]
                </span>
                {topic.label}
              </button>
            );
          })}
        </div>
      )}
    </form>
  );
});
