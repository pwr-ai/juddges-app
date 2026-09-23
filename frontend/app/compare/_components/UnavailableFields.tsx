"use client";

import { useTranslation } from "@/contexts/LanguageContext";
import type { CompareField } from "@/lib/compare/types";

/**
 * Fields that cannot be compared because one (or both) jurisdictions have no
 * coded value in this result. Listed as sentences, never drawn as a 0 % bar.
 */
export function UnavailableFields({ fields }: { fields: CompareField[] }) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <ul className="space-y-2 border border-rule bg-parchment-deep px-4 py-3 text-sm text-ink">
      {fields.map((field) => {
        const missing = field.missing_in;
        if (missing.length >= 2 || missing.length === 0) {
          return (
            <li key={field.field}>{t("compare.unavailableBoth", { field: field.label })}</li>
          );
        }
        const jurisdiction = missing[0];
        const stat = field.coverage[jurisdiction];
        return (
          <li key={field.field}>
            {t("compare.unavailableOne", {
              field: field.label,
              jurisdiction,
              covered: stat?.covered ?? 0,
              total: stat?.total ?? 0,
            })}
          </li>
        );
      })}
    </ul>
  );
}
