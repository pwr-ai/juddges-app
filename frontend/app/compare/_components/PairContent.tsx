"use client";

import type { ReactNode } from "react";

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
import { UnavailableFields } from "./UnavailableFields";

/** True when `error` is one of our `.status`-tagged fetch failures (see lib/compare/api.ts). */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

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

/**
 * The invitation-to-extract block shown whenever there is nothing to chart
 * because no job has produced a matching schema yet.
 */
function ExtractInvite({ data, message }: { data: PairCompareResponse; message: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 border border-rule p-6">
      <p className="text-sm text-ink-soft">{message}</p>
      <div className="flex flex-wrap gap-3">
        <EditorialButton size="sm" variant="secondary" href={`/extract?collection=${data.pair.pl_collection_id}`}>
          {t("compare.extractOnBoth", { jurisdiction: "PL" })}
        </EditorialButton>
        <EditorialButton size="sm" variant="secondary" href={`/extract?collection=${data.pair.uk_collection_id}`}>
          {t("compare.extractOnBoth", { jurisdiction: "UK" })}
        </EditorialButton>
      </div>
    </div>
  );
}

function ExtensionSchemaSection({ data }: { data: PairCompareResponse }) {
  const { t } = useTranslation();
  // The extension tally's own fields (source: 'schema:<id>'), never the base
  // fields already shown above through CompareView.
  const rawFields = data.extension?.fields ?? [];
  const byTier = (tier: Tier): CompareField[] => rawFields.filter((f) => f.tier === tier);
  // Same three tiers CompareView renders — 'empty' (no data on either side)
  // is never drawn, chart or sentence, exactly as it is for the base fields.
  const primary = byTier("primary");
  const partial = byTier("partial");
  const unavailable = byTier("unavailable");
  let figure = 0;

  let body: ReactNode;
  if (rawFields.length === 0) {
    if (data.extension) {
      // A job ran on both sides with a matching schema, but the schema
      // itself has nothing this comparison can chart (e.g. all free-text).
      // Re-running extraction wouldn't change that, so no extract links.
      body = <p className="border border-rule p-6 text-sm text-ink-soft">{t("compare.pairSchemaEmpty")}</p>;
    } else {
      const message =
        data.extension_reason && data.extension_reason !== "no_jobs"
          ? t(REASON_KEY[data.extension_reason])
          : t("compare.pairNoSchema");
      body = <ExtractInvite data={data} message={message} />;
    }
  } else {
    body = (
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
            <UnavailableFields fields={unavailable} />
          </TierSection>
        )}
      </>
    );
  }

  return (
    <section role="region" aria-labelledby="pair-schema-heading" className="space-y-8">
      <Eyebrow id="pair-schema-heading" as="p">
        {t("compare.pairSchemaSection")}
      </Eyebrow>
      {body}
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

function NotFoundNotice() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 border border-rule border-l-2 border-l-oxblood p-6">
      <p className="text-sm text-ink">{t("compare.pairNotFound")}</p>
      <EditorialButton size="sm" variant="secondary" href="/compare">
        {t("compare.backToCompare")}
      </EditorialButton>
    </div>
  );
}

export function PairContent({ pairId }: { pairId: string }) {
  const { t } = useTranslation();
  const query = useComparePair(pairId);
  const notFound = query.isError && errorStatus(query.error) === 404;

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
            {notFound ? (
              <NotFoundNotice />
            ) : (
              <ErrorCard title={t("common.error")} message={t("compare.loadError")} />
            )}
          </div>
        )}

        {!query.isLoading && !query.isError && query.data && (
          <>
            <PairHeader pair={query.data.pair} />

            <CompareView
              data={query.data}
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
