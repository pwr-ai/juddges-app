"use client";

import { DualStatCard } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";

/** N_UK / N_PL — the two result-set sizes every share below is drawn from. */
export function CompareTotals({ totals }: { totals: Record<string, number> }) {
  const { t } = useTranslation();
  return (
    <DualStatCard
      label={t("compare.matching")}
      ukValue={totals.UK ?? 0}
      plValue={totals.PL ?? 0}
      leftLabel={t("compare.matchingUk")}
      rightLabel={t("compare.matchingPl")}
      className="max-w-md"
    />
  );
}
