"use client";

import { BivariateBarChart } from "@/components/charts/BivariateBarChart";
import { ChartFigure } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { formatCoverage, toShareChart } from "@/lib/compare/chart-data";
import type { CompareField } from "@/lib/compare/types";
import { formatEnumOptionLabel } from "@/lib/extractions/base-schema-filter-config";

import { CoverageBadge } from "./CoverageBadge";

/**
 * One coded field as a grouped share chart (UK ink, PL oxblood), in percent
 * of the documents where the field is coded. Partial-coverage fields carry
 * the coverage badge as their caption.
 */
export function FieldComparisonFigure({ field, index }: { field: CompareField; index: number }) {
  const { t } = useTranslation();
  const chart = toShareChart(field, formatEnumOptionLabel);
  const source = formatCoverage(field.coverage).join(" · ");

  return (
    <ChartFigure
      figure={String(index).padStart(2, "0")}
      eyebrow={field.source === "base" ? t("compare.baseSchemaEyebrow") : t("compare.extendedSchemaEyebrow")}
      title={field.label}
      caption={field.tier === "partial" ? <CoverageBadge coverage={field.coverage} /> : undefined}
      source={source}
    >
      <BivariateBarChart
        categories={chart.categories}
        plData={chart.plData}
        ukData={chart.ukData}
        plName="PL"
        ukName="UK"
        yAxisTitle={t("compare.shareAxis")}
        yTickSuffix="%"
        hoverTemplate="%{y:.1f}%<extra>%{fullData.name}</extra>"
        tickAngle={chart.categories.length > 4 ? -30 : undefined}
        showCounts
      />
    </ChartFigure>
  );
}
