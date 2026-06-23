"use client";

import { useCallback, useEffect, useState } from "react";

import logger from "@/lib/logger";

const suggestionsLogger = logger.child("useSearchSuggestions");

/**
 * A single corpus-derived suggestion (issue #153) returned by
 * `GET /api/search/suggest`. Mined from the PL + EN judgment corpus.
 */
export interface SuggestionHit {
  id: string;
  term: string;
  language: "pl" | "en" | string;
  category: string;
  weight: number;
  _formatted?: Record<string, string | string[]> | null;
}

interface UseSearchSuggestionsOptions {
  enabled?: boolean;
  debounceMs?: number;
  minChars?: number;
  limit?: number;
  /** Optional language filter ("pl" | "en"); omit for both. */
  language?: "pl" | "en" | null;
}

interface UseSearchSuggestionsResult {
  suggestionHits: SuggestionHit[];
  isLoading: boolean;
  clearSuggestions: () => void;
}

interface SuggestResponse {
  suggestion_hits?: SuggestionHit[];
}

/**
 * Debounced fetch of corpus-derived autocomplete suggestions.
 *
 * Mirrors {@link useSearchAutocomplete}: surfaces a loading state during the
 * debounce window and degrades to an empty list on any failure so the caller
 * can fall back to its existing behaviour.
 */
export function useSearchSuggestions(
  query: string,
  {
    enabled = true,
    debounceMs = 250,
    minChars = 2,
    limit = 8,
    language = null,
  }: UseSearchSuggestionsOptions = {}
): UseSearchSuggestionsResult {
  const [suggestionHits, setSuggestionHits] = useState<SuggestionHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const clearSuggestions = useCallback(() => {
    setSuggestionHits([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!enabled || trimmedQuery.length < minChars) {
      clearSuggestions();
      return;
    }

    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", trimmedQuery);
        params.set("limit", String(limit));
        if (language) {
          params.set("language", language);
        }

        const response = await fetch(`/api/search/suggest?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          setSuggestionHits([]);
          return;
        }

        const data = (await response.json()) as SuggestResponse;
        setSuggestionHits(data.suggestion_hits ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        suggestionsLogger.warn("Suggestion request failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        setSuggestionHits([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [clearSuggestions, debounceMs, enabled, language, limit, minChars, query]);

  return {
    suggestionHits,
    isLoading,
    clearSuggestions,
  };
}
