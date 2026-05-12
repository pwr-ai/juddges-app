"use client";

import { useCallback, useEffect, useState } from "react";

import logger from "@/lib/logger";

const autocompleteLogger = logger.child("useSearchAutocomplete");

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
  topicHits: TopicHit[];
  isLoading: boolean;
  clearSuggestions: () => void;
}

interface AutocompleteResponse {
  topic_hits?: TopicHit[];
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
  const [topicHits, setTopicHits] = useState<TopicHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const clearSuggestions = useCallback(() => {
    setTopicHits([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!enabled || trimmedQuery.length < minChars) {
      clearSuggestions();
      return;
    }

    // Flip loading on synchronously so the dropdown shows a loading state
    // during the debounce window — not just during the network round-trip.
    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
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
          setTopicHits([]);
          return;
        }

        const data = (await response.json()) as AutocompleteResponse;
        setTopicHits(data.topic_hits ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        autocompleteLogger.warn("Autocomplete request failed", {
          message: error instanceof Error ? error.message : String(error),
        });
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
    topicHits,
    isLoading,
    clearSuggestions,
  };
}
