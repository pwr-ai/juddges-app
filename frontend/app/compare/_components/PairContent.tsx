"use client";

// =============================================================================
// PairContent — `/compare/[pairId]` (issue #684, Task 18).
//
// A saved pair's base-field comparison (rendered through the same `CompareView`
// as /compare, Task 16) plus its extension-schema tally: figures for
// `extension.fields` when an extraction job ran on both sides with a matching
// schema, otherwise a notice keyed on `extension_reason` (see
// backend/app/compare/models.py:ExtensionReason) inviting extraction on
// whichever collection(s) still need it.
//
// The pair endpoint (`GET /compare/pairs/{id}`) is read-only and takes no
// filter input, so CSV export and the permalink both operate on the pair's
// own membership: `request = { filters: data.filters, text_query: data.text_query }`
// (`data.filters` is the server-built `{"collection_ids": [pl, uk]}`).
// =============================================================================

import { EditorialButton, EditorialCardSkeleton, Eyebrow, Headline, PaperBackground, Rule } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/types";
import { useComparePair } from "@/lib/compare/api";
import { buildPairPermalink } from "@/lib/compare/permalink";
import type { CompareField, CompareRequest, ExtensionReason, PairCompareResponse, Tier } from "@/lib/compare/types";
import { ErrorCard } from "@/lib/styles/components";

import { CompareView, TierSection } from "./CompareContent";
import { FieldComparisonFigure } from "./FieldComparisonFigure";

/**
 * i18n key per `ExtensionReason`, except `no_jobs` — that case reuses the
 * existing `pairNoSchema` copy ("run the schema on both"), which already
 * describes it exactly; the other five each get their own message.
 */
const REASON_KEY: Record<Exclude<ExtensionReason, "no_jobs">, TranslationKey> = {
  no_job_pl: "compare.pairExtensionNoJobPl",
  no_job_uk: "compare.pairExtensionNoJobUk",
  schema_mismatch: "compare.pairExtensionSchemaMismatch",
  schema_not_found: "compare.pairExtensionSchemaNotFound",
  extension_failed: "compare.pairExtensionFailed",
};

function ExtensionSchemaSection({ data }: { data: PairCompareResponse }) {
  const { t } = useTranslation();
  const fields = data.extension?.fields ?? [];
  const byTier = (tier: Tier): CompareField[] => fields.filter((f) => f.tier === tier);
  const primary = byTier("primary");
  const partial = byTier("partial");
  const unavailable = byTier("unavailable");
  let figure = 0;

  return (
    <section role="region" aria-labelledby="pair-schema-heading" className="space-y-8">
      <Eyebrow id="pair-schema-heading" as="p">
        {t("compare.pairSchemaSection")}
      </Eyebrow>

      {fields.length === 0 ? (
        <div className="space-y-4 border border-rule p-6">
          <p className="text-sm text-ink-soft">
            {data.extension_reason && data.extension_reason !== "no_jobs"
              ? t(REASON_KEY[data.extension_reason])
              : t("compare.pairNoSchema")}
          </p>
          <div className="flex flex-wrap gap-3">
            <EditorialButton size="sm" variant="secondary" href={`/extract?collection=${data.pair.pl_collection_id}`}>
              {t("compare.extractOnBoth", { jurisdiction: "PL" })}
            </EditorialButton>
            <EditorialButton size="sm" variant="secondary" href={`/extract?collection=${data.pair.uk_collection_id}`}>
              {t("compare.extractOnBoth", { jurisdiction: "UK" })}
            </EditorialButton>
          </div>
        </div>
      ) : (
        <>
          {primary.length > 0 && (
            <TierSection id="pair-schema-primary" title={t("compare.sectionPrimary")}>
              <div className="grid gap-8 lg:grid-cols-2">
                {primary.map((f) => (
                  <FieldComparisonFigure key={f.field} field={f} index={++figure} />
                ))}
              </div>
            </TierSection>
          )}
          {partial.length > 0 && (
            <TierSection id="pair-schema-partial" title={t("compare.sectionPartial")}>
              <div className="grid gap-8 lg:grid-cols-2">
                {partial.map((f) => (
                  <FieldComparisonFigure key={f.field} field={f} index={++figure} />
                ))}
              </div>
            </TierSection>
          )}
          {unavailable.length > 0 && (
            <TierSection id="pair-schema-unavailable" title={t("compare.sectionUnavailable")}>
              <div className="grid gap-8 lg:grid-cols-2">
                {unavailable.map((f) => (
                  <FieldComparisonFigure key={f.field} field={f} index={++figure} />
                ))}
              </div>
            </TierSection>
          )}
        </>
      )}
    </section>
  );
}

function PairHeader({ pair }: { pair: PairCompareResponse["pair"] }) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Eyebrow tone="oxblood">{t("compare.pairEyebrow")}</Eyebrow>
        <Headline as="h1" size="sm">
          {pair.name}
        </Headline>
      </div>
      <div className="flex flex-wrap gap-3">
        <EditorialButton size="sm" variant="secondary" href={`/collections/${pair.pl_collection_id}`}>
          {pair.name} — PL
        </EditorialButton>
        <EditorialButton size="sm" variant="secondary" href={`/collections/${pair.uk_collection_id}`}>
          {pair.name} — UK
        </EditorialButton>
      </div>
    </header>
  );
}

export function PairContent({ pairId }: { pairId: string }) {
  const { t } = useTranslation();
  const query = useComparePair(pairId);

  return (
    <PaperBackground>
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        {query.isLoading && (
          <div className="grid gap-8 lg:grid-cols-2">
            <EditorialCardSkeleton />
            <EditorialCardSkeleton />
          </div>
        )}

        {query.isError && (
          <div role="alert">
            <ErrorCard title={t("common.error")} message={t("compare.loadError")} />
          </div>
        )}

        {!query.isLoading && !query.isError && query.data && (
          <>
            <PairHeader pair={query.data.pair} />

            <CompareView
              data={{ ...query.data, fields: query.data.fields }}
              request={
                { filters: query.data.filters, text_query: query.data.text_query } satisfies CompareRequest
              }
              permalink={buildPairPermalink(pairId)}
            />

            <Rule spaced />

            <ExtensionSchemaSection data={query.data} />
          </>
        )}
      </div>
    </PaperBackground>
  );
}

export default PairContent;
