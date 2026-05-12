"use client";

import { useCallback, useEffect, useState } from "react";

import logger from "@/lib/logger";

const autocompleteLogger = logger.child("useSearchAutocomplete");

export type AutocompleteSource = "legal_topics" | "keywords" | "cited_legislation";

export interface AutocompleteSuggestion {
  value: string;
  count: number;
  sources: AutocompleteSource[];
}

export interface TopicHit {
  id: string;
  label_pl: string;
  label_en: string;
  aliases_pl: string[];
  aliases_en: string[];
  category: string | null;
  doc_count: number;
  jurisdictions: string[];
  _formatted?: Record<string, string | string[]> | null;
}

export interface TopicLabel {
  primary: string;
  secondary: string;
}

/**
 * Pick the locale-aware primary/secondary label for a topic hit.
 *
 * - locale `"pl"` → primary is `label_pl`, secondary is `label_en`
 * - locale `"en"` (or anything else) → reversed
 */
export function pickTopicLabel(hit: TopicHit, locale: string): TopicLabel {
  const lang = locale.split("-")[0].toLowerCase();
  if (lang === "pl") {
    return { primary: hit.label_pl, secondary: hit.label_en };
  }
  return { primary: hit.label_en, secondary: hit.label_pl };
}

interface UseSearchAutocompleteOptions {
  enabled?: boolean;
  debounceMs?: number;
  minChars?: number;
  limit?: number;
}

interface UseSearchAutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  topicHits: TopicHit[];
  isLoading: boolean;
  clearSuggestions: () => void;
}

interface AutocompleteHit {
  value?: string;
  count?: number;
  sources?: string[];
}

interface AutocompleteResponse {
  hits?: AutocompleteHit[];
  topic_hits?: TopicHit[];
}

const KNOWN_SOURCES: ReadonlySet<AutocompleteSource> = new Set([
  "legal_topics",
  "keywords",
  "cited_legislation",
]);

function mapHitToSuggestion(hit: AutocompleteHit): AutocompleteSuggestion | null {
  const value = (hit.value || "").trim();
  if (!value) {
    return null;
  }
  const sources = (hit.sources || []).filter((s): s is AutocompleteSource =>
    KNOWN_SOURCES.has(s as AutocompleteSource)
  );
  return {
    value,
    count: typeof hit.count === "number" ? hit.count : 0,
    sources,
  };
}

export function useSearchAutocomplete(
  query: string,
  {
    enabled = true,
    debounceMs = 250,
    minChars = 2,
    limit = 8,
  }: UseSearchAutocompleteOptions = {}
): UseSearchAutocompleteResult {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [topicHits, setTopicHits] = useState<TopicHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setTopicHits([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!enabled || trimmedQuery.length < minChars) {
      clearSuggestions();
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", trimmedQuery);
        params.set("limit", String(limit));

        const response = await fetch(`/api/search/autocomplete?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          setSuggestions([]);
          setTopicHits([]);
          return;
        }

        const data = (await response.json()) as AutocompleteResponse;
        const mapped = (data.hits || [])
          .map(mapHitToSuggestion)
          .filter((item): item is AutocompleteSuggestion => item !== null);
        setSuggestions(mapped);
        setTopicHits(data.topic_hits ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        autocompleteLogger.warn("Autocomplete request failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        setSuggestions([]);
        setTopicHits([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [clearSuggestions, debounceMs, enabled, limit, minChars, query]);

  return {
    suggestions,
    topicHits,
    isLoading,
    clearSuggestions,
  };
}
