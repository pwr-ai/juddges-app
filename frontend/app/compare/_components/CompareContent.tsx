"use client";

import { useEffect, useMemo } from "react";

import { EditorialButton, Eyebrow, Headline, PaperBackground, Rule } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { useCompare } from "@/lib/compare/api";
import { buildComparePermalink } from "@/lib/compare/permalink";
import type { CompareField, CompareRequest, CompareResponse, Tier } from "@/lib/compare/types";
import { applyDrawerChange, toDrawerFilters } from "@/lib/extractions/drawer-adapter";
import { countActive, useExtractedDataFilters } from "@/lib/extractions/use-extracted-data-filters";
import logger from "@/lib/logger";
import { ErrorCard } from "@/lib/styles/components";

import { CompareFilterBar } from "./CompareFilterBar";
import { CompareTotals } from "./CompareTotals";
import { ExportMenu } from "./ExportMenu";
import { FieldComparisonFigure } from "./FieldComparisonFigure";
import { UnavailableFields } from "./UnavailableFields";

const pageLogger = logger.child("ComparePage");

/** Exported for reuse by PairContent's extension-schema section (Task 18). */
export function TierSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} role="region" className="space-y-6">
      <Eyebrow id={id} as="p">
        {title}
      </Eyebrow>
      {children}
    </section>
  );
}

function IgnoredFiltersNotice({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  if (keys.length === 0) return null;
  const others = keys.filter((k) => k !== "jurisdiction");
  return (
    <p role="status" className="border border-rule bg-parchment-deep px-3 py-2 text-xs text-ink">
      {t("compare.jurisdictionIgnored")}
      {others.length > 0 && <span className="ml-2 font-mono text-ink-soft">({others.join(", ")})</span>}
    </p>
  );
}

export interface CompareViewProps {
  data: CompareResponse;
  request: CompareRequest;
  /** Task 17 mounts the save-pair dialog behind this; no handler → no button. */
  onSavePair?: () => void;
  /**
   * Override the `?f=…&q=…` deep link `buildComparePermalink` would compute
   * from `request`. `/compare/[pairId]` (Task 18) passes `buildPairPermalink`
   * here instead — the pair has its own stable, shorter URL.
   */
  permalink?: string;
}

/**
 * Pure presentation of one `CompareResponse`: totals, export, figures by
 * coverage tier. `primary` fields lead; `partial` follow with a coverage
 * badge; `unavailable` are listed in words; `empty` (no data on either side)
 * are hidden — nothing is ever drawn as a 0 % bar.
 */
export function CompareView({ data, request, onSavePair, permalink: permalinkOverride }: CompareViewProps) {
  const { t } = useTranslation();
  const byTier = (tier: Tier): CompareField[] => data.fields.filter((f) => f.tier === tier);
  const primary = byTier("primary");
  const partial = byTier("partial");
  const unavailable = byTier("unavailable");
  const nothing = (data.totals.PL ?? 0) === 0 && (data.totals.UK ?? 0) === 0;
  const permalink = permalinkOverride ?? buildComparePermalink(request.filters, request.text_query ?? "");
  let figure = 0;

  return (
    <div className="space-y-12">
      <IgnoredFiltersNotice keys={data.ignored_filter_keys} />

      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <CompareTotals totals={data.totals} />
        <div className="flex flex-wrap items-center gap-3">
          <ExportMenu request={request} permalink={permalink} />
          {onSavePair && !nothing && (
            <EditorialButton size="sm" onClick={onSavePair}>
              {t("compare.savePair")}
            </EditorialButton>
          )}
        </div>
      </div>

      {nothing ? (
        <div className="border border-rule p-6">
          <Headline as="h2" size="xs">
            {t("compare.noMatchesTitle")}
          </Headline>
          <p className="mt-2 text-sm text-ink-soft">{t("compare.noMatchesBody")}</p>
        </div>
      ) : (
        <>
          {primary.length > 0 && (
            <TierSection id="compare-primary" title={t("compare.sectionPrimary")}>
              <div className="grid gap-8 lg:grid-cols-2">
                {primary.map((f) => (
                  <FieldComparisonFigure key={f.field} field={f} index={++figure} />
                ))}
              </div>
            </TierSection>
          )}
          {partial.length > 0 && (
            <TierSection id="compare-partial" title={t("compare.sectionPartial")}>
              <div className="grid gap-8 lg:grid-cols-2">
                {partial.map((f) => (
                  <FieldComparisonFigure key={f.field} field={f} index={++figure} />
                ))}
              </div>
            </TierSection>
          )}
          {unavailable.length > 0 && (
            <TierSection id="compare-unavailable" title={t("compare.sectionUnavailable")}>
              <UnavailableFields fields={unavailable} />
            </TierSection>
          )}
        </>
      )}

      <Rule spaced />
      <p className="text-xs text-ink-soft">{t("compare.dataNote")}</p>
    </div>
  );
}

/**
 * `/compare` page body. Filter state lives in the URL via the same hook and
 * codec as /search/extractions, so a `?f=…&q=…` link is portable between the
 * two pages. The comparison only runs once something is filtered — an
 * unfiltered compare would tally the whole corpus twice.
 */
export function CompareContent({ onSavePair }: { onSavePair?: (request: CompareRequest) => void } = {}) {
  const { t } = useTranslation();
  const { filters, textQuery, setFilters, setTextQuery, setNlQuestion, removeFilter, clearAll } =
    useExtractedDataFilters();

  const active = countActive(filters) > 0 || textQuery.trim() !== "";
  const request = useMemo<CompareRequest>(
    () => ({ filters, text_query: textQuery.trim() || null }),
    [filters, textQuery],
  );
  const query = useCompare(request, active);

  useEffect(() => {
    if (query.error) pageLogger.error("Compare failed", query.error);
  }, [query.error]);

  const resetDrawer = () => {
    const next = { ...filters } as Record<string, unknown>;
    for (const field of Object.keys(toDrawerFilters(filters))) delete next[field];
    setFilters(next as typeof filters);
  };

  return (
    <PaperBackground>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <Eyebrow tone="oxblood">PL · UK</Eyebrow>
          <Headline as="h1" size="sm">
            {t("compare.pageTitle")}
          </Headline>
          <p className="max-w-2xl text-sm text-ink-soft">{t("compare.pageSubtitle")}</p>
        </header>

        <CompareFilterBar
          filters={filters}
          textQuery={textQuery}
          onApply={(f, q, question) => {
            setFilters(f);
            setTextQuery(q);
            setNlQuestion(question);
          }}
          onTextQuery={setTextQuery}
          onRemove={removeFilter}
          onClearText={() => setTextQuery("")}
          onClearAll={clearAll}
          onDrawerChange={(field, value) => setFilters(applyDrawerChange(filters, field, value))}
          onDrawerReset={resetDrawer}
        />

        {!active && (
          <div className="border border-rule p-8 text-center">
            <Headline as="h2" size="xs">
              {t("compare.emptyTitle")}
            </Headline>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{t("compare.emptyBody")}</p>
          </div>
        )}

        {active && query.isPending && (
          <p role="status" aria-busy className="font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">
            {t("compare.loading")}
          </p>
        )}

        {active && query.isError && (
          <div role="alert">
            <ErrorCard
              title={t("common.error")}
              message={t("compare.loadError")}
              onRetry={() => {
                void query.refetch();
              }}
              retryLabel={t("common.retry")}
            />
          </div>
        )}

        {active && query.data && (
          <div aria-busy={query.isFetching} className={query.isFetching ? "opacity-60" : undefined}>
            <CompareView
              data={query.data}
              request={request}
              onSavePair={onSavePair ? () => onSavePair(request) : undefined}
            />
          </div>
        )}
      </div>
    </PaperBackground>
  );
}
