"use client";

import { useCallback, useEffect, useState } from "react";

import logger from "@/lib/logger";

const autocompleteLogger = logger.child("useSearchAutocomplete");

export interface AutocompleteSuggestion {
  id: string;
  title: string;
  summary?: string;
  caseNumber?: string;
  jurisdiction?: string;
  courtName?: string;
  decisionDate?: string;
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
  id?: string;
  document_id?: string;
  title?: string;
  summary?: string;
  case_number?: string;
  jurisdiction?: string;
  court_name?: string;
  decision_date?: string;
  _formatted?: {
    title?: string;
    summary?: string;
    case_number?: string;
    court_name?: string;
  };
}

interface AutocompleteResponse {
  hits?: AutocompleteHit[];
  topic_hits?: TopicHit[];
}

function mapHitToSuggestion(hit: AutocompleteHit): AutocompleteSuggestion | null {
  // Prefer _formatted (highlighted) fields when available
  const formatted = hit._formatted;
  const title = (formatted?.title || hit.title || "").trim();
  if (!title) {
    return null;
  }

  return {
    id: String(hit.id || hit.document_id || title),
    title,
    summary: (formatted?.summary || hit.summary || "").trim() || undefined,
    caseNumber: (hit.case_number || "").trim() || undefined,
    jurisdiction: hit.jurisdiction || undefined,
    courtName: (formatted?.court_name || hit.court_name || "").trim() || undefined,
    decisionDate: hit.decision_date || undefined,
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
