"use client";

import { Database, Languages, type LucideIcon } from "lucide-react";

import { EditorialButton } from "@/components/editorial";
import { useOptionalTranslation } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/types";
import { buildSearchHref } from "@/lib/searchHref";
import { cn } from "@/lib/utils";

/**
 * The two ways of working with judgments in this app, shown on the landing
 * page, the dashboard and the help/about pages so the split is explicit:
 *
 * - `full`: the Polish-native full corpus (~2.7M judgments, Weaviate v2).
 * - `curated`: the comparative PL + EN set (Supabase), with LLM extractions.
 *
 * The ids match the `engine` query parameter of `/search`. Mode names and
 * descriptions are the same catalog strings the `/search` switch shows
 * (`search.engine*` in `lib/i18n/translations`).
 */
export type SearchModeId = "full" | "curated";

export interface SearchMode {
  id: SearchModeId;
  icon: LucideIcon;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  points: readonly string[];
  cta: string;
}

export const SEARCH_MODES: readonly SearchMode[] = [
  {
    id: "full",
    icon: Database,
    labelKey: "search.engineFullLabel",
    descriptionKey: "search.engineFullDescription",
    points: [
      "Common courts and administrative courts (NSA)",
      "Hybrid semantic + keyword search tuned for Polish",
      "Exhaustive case-law research, full text of every result",
    ],
    cta: "Search the full corpus",
  },
  {
    id: "curated",
    icon: Languages,
    labelKey: "search.engineCuratedLabel",
    descriptionKey: "search.engineCuratedDescription",
    points: [
      "Two jurisdictions and two languages side by side",
      "Structured extractions with the shared base schema",
      "Filters on extracted fields, collections, export, topic comparison",
    ],
    cta: "Compare jurisdictions",
  },
];

export function searchModeHref(id: SearchModeId, q?: string): string {
  return buildSearchHref({ engine: id, q });
}

interface SearchModesOverviewProps {
  /** Live size of the curated set, e.g. from the dashboard stats. */
  curatedCount?: number | null;
  /** Tighter layout for the signed-in dashboard. */
  compact?: boolean;
  className?: string;
}

export function SearchModesOverview({
  curatedCount,
  compact = false,
  className,
}: SearchModesOverviewProps) {
  const { t, locale } = useOptionalTranslation();
  return (
    <div
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}
      data-testid="search-modes-overview"
    >
      {SEARCH_MODES.map((mode) => {
        const Icon = mode.icon;
        const label = t(mode.labelKey);
        const at = label.indexOf(" · ");
        const [name, corpus] = at < 0 ? [label, null] : [label.slice(0, at), label.slice(at + 3)];
        const liveCount =
          mode.id === "curated" && curatedCount
            ? curatedCount.toLocaleString(locale === "pl" ? "pl-PL" : "en-US")
            : null;
        return (
          <section
            key={mode.id}
            aria-labelledby={`search-mode-${mode.id}`}
            className={cn(
              "flex flex-col border border-rule bg-parchment",
              mode.id === "full" ? "border-t-4 border-t-oxblood" : "border-t-4 border-t-ink",
              compact ? "p-5" : "p-6 md:p-8"
            )}
          >
            <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-oxblood">
              <Icon className="size-3.5" aria-hidden />
              {corpus}
            </p>
            <h3
              id={`search-mode-${mode.id}`}
              className={cn(
                "mt-2 font-serif leading-tight text-ink",
                compact ? "text-2xl" : "text-3xl"
              )}
            >
              <span className="sr-only">{label}</span>
              <span aria-hidden>{name}</span>
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(mode.descriptionKey)}</p>
            {liveCount && (
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-soft tabular-nums">
                {liveCount} · Poland · England &amp; Wales
              </p>
            )}
            <ul className="mt-4 flex-1 space-y-1.5 text-sm leading-relaxed text-ink-soft">
              {mode.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden className="text-gold">
                    ·
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <EditorialButton
                href={searchModeHref(mode.id)}
                variant={mode.id === "full" ? "primary" : "secondary"}
                size={compact ? "sm" : "md"}
                arrow
              >
                {mode.cta}
              </EditorialButton>
            </div>
          </section>
        );
      })}
    </div>
  );
}
