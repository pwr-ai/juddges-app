import { Database, Languages, type LucideIcon } from "lucide-react";

import { EditorialButton } from "@/components/editorial";
import { buildSearchHref } from "@/lib/searchHref";
import { cn } from "@/lib/utils";

/**
 * The two ways of working with judgments in this app, shown on the landing
 * page, the dashboard and the help/about pages so the split is explicit:
 *
 * - `full`: the Polish-native full corpus (~2.7M judgments, Weaviate v2).
 * - `curated`: the comparative PL + EN set (Supabase), with LLM extractions.
 *
 * The ids match the `engine` query parameter of `/search`.
 */
export type SearchModeId = "full" | "curated";

export interface SearchMode {
  id: SearchModeId;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  size: string;
  points: readonly string[];
  cta: string;
}

export const SEARCH_MODES: readonly SearchMode[] = [
  {
    id: "full",
    icon: Database,
    eyebrow: "Polish native · full corpus",
    title: "All Polish judgments",
    size: "~2.7 million judgments",
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
    eyebrow: "Comparative · PL + EN",
    title: "Curated Polish & English set",
    size: "Poland · England & Wales",
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
  return (
    <div
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}
      data-testid="search-modes-overview"
    >
      {SEARCH_MODES.map((mode) => {
        const Icon = mode.icon;
        const size =
          mode.id === "curated" && curatedCount
            ? `${curatedCount.toLocaleString("en-US")} judgments · ${mode.size}`
            : mode.size;
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
              {mode.eyebrow}
            </p>
            <h3
              id={`search-mode-${mode.id}`}
              className={cn(
                "mt-2 font-serif leading-tight text-ink",
                compact ? "text-2xl" : "text-3xl"
              )}
            >
              {mode.title}
            </h3>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-soft">
              {size}
            </p>
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
