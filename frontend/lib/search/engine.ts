/**
 * Which search engine `/search` uses, and why.
 *
 * - `full`: Weaviate v2, the whole Polish corpus (~2.7M judgments, pl-court +
 *   NSA). The default for signed-in users. No LLM extractions, PL only.
 * - `curated`: the Supabase/Meilisearch path over the curated PL + EN set with
 *   LLM extractions. The only engine for guests (`/search/v2` needs a session).
 *
 * Rule: an explicit `?engine=` wins. Without one, a signed-in user gets `full`
 * unless the search state already uses something only `curated` can serve —
 * then `curated`, and the page says why (`curatedOnlyReasons`), never silently.
 */
import type { TranslationKey } from "@/lib/i18n/types";
import type { BaseFilters } from "@/lib/store/searchStore";

export type SearchEngine = "full" | "curated";

export const ENGINE_PARAM = "engine";
export const DEFAULT_SIGNED_IN_ENGINE: SearchEngine = "full";

/** `?engine=` value, accepting the pre-rename `v2` / `standard` links too. */
export function parseEngineParam(value: string | null | undefined): SearchEngine | null {
  switch (value) {
    case "full":
    case "v2":
      return "full";
    case "curated":
    case "standard":
      return "curated";
    default:
      return null;
  }
}

export interface CuratedOnlyState {
  selectedLanguages: Iterable<string>;
  jurisdictions: Iterable<string>;
  baseFilters: BaseFilters;
  customMetadata: Record<string, unknown>;
}

/** Why a search needs the curated engine; labels: `search.engineReason*`. */
export type CuratedReason = "english" | "jurisdiction" | "extractions" | "metadata";

export const CURATED_REASON_KEYS = {
  english: "search.engineReasonEnglish",
  jurisdiction: "search.engineReasonJurisdiction",
  extractions: "search.engineReasonExtractions",
  metadata: "search.engineReasonMetadata",
} as const satisfies Record<CuratedReason, TranslationKey>;

/**
 * Reasons the current search state needs the curated engine. Empty when the
 * full corpus can serve it.
 */
export function curatedOnlyReasons(state: CuratedOnlyState): CuratedReason[] {
  const reasons: CuratedReason[] = [];
  const languages = new Set(Array.from(state.selectedLanguages, (l) => l.toLowerCase()));
  if (languages.size > 0 && !languages.has("pl")) {
    reasons.push("english");
  }
  const jurisdictions = Array.from(state.jurisdictions, (j) => j.toUpperCase());
  if (jurisdictions.some((j) => j !== "PL")) {
    reasons.push("jurisdiction");
  }
  if (Object.values(state.baseFilters).some((v) => v !== undefined)) {
    reasons.push("extractions");
  }
  if (Object.keys(state.customMetadata).length > 0) {
    reasons.push("metadata");
  }
  return reasons;
}

export function resolveEngine({
  signedIn,
  explicit,
  reasons,
}: {
  signedIn: boolean;
  explicit: SearchEngine | null;
  reasons: readonly CuratedReason[];
}): SearchEngine {
  if (!signedIn) return "curated";
  if (explicit) return explicit;
  return reasons.length > 0 ? "curated" : DEFAULT_SIGNED_IN_ENGINE;
}

/**
 * `CuratedOnlyState` as it will be once the URL is read into the store: the
 * URL's own params win, the persisted store fills in the rest. Lets the page
 * pick the engine on first render instead of waiting for the URL sync.
 */
export function curatedOnlyStateFromUrl(
  params: Pick<URLSearchParams, "get">,
  stored: CuratedOnlyState
): CuratedOnlyState {
  const list = (name: string): string[] | null => {
    const value = params.get(name);
    return value ? value.split(",").filter(Boolean) : null;
  };
  const json = (name: string): Record<string, unknown> | null => {
    const value = params.get(name);
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  return {
    selectedLanguages: list("lang") ?? stored.selectedLanguages,
    jurisdictions: list("jurisdictions") ?? stored.jurisdictions,
    baseFilters: (json("extracted") as BaseFilters | null) ?? stored.baseFilters,
    customMetadata: json("customMeta") ?? stored.customMetadata,
  };
}
