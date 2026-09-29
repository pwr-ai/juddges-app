"use client";

import { Eyebrow } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { coveragePercent } from "@/lib/compare/chart-data";
import type { CoverageStat } from "@/lib/compare/types";

/**
 * "coverage PL 74 % / UK 98 %" — shown on partial-tier figures so the reader
 * knows the shares are computed over a subset of the matching judgments.
 */
export function CoverageBadge({ coverage }: { coverage: Record<string, CoverageStat> }) {
  const { t } = useTranslation();
  const pct = (j: string) => {
    const stat = coverage[j];
    const value = stat ? coveragePercent(stat) : null;
    return value == null ? "—" : value;
  };
  return (
    <Eyebrow tone="oxblood" noRule>
      {t("compare.coverageBadge", { pl: pct("PL"), uk: pct("UK") })}
    </Eyebrow>
  );
}
