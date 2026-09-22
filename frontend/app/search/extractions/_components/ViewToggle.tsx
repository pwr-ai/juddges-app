"use client";

import { useTranslation } from "@/contexts/LanguageContext";
import type { ResultView } from "@/lib/extractions/use-extracted-data-filters";

export interface ViewToggleProps {
  view: ResultView;
  onChange: (view: ResultView) => void;
}

/** List | Statistics segmented control (#708). */
export function ViewToggle({ view, onChange }: ViewToggleProps) {
  const { t } = useTranslation();
  const options: { value: ResultView; label: string }[] = [
    { value: "list", label: t("extraction.listView") },
    { value: "stats", label: t("extraction.statsView") },
  ];
  return (
    <div role="radiogroup" aria-label={t("extraction.statsView")} className="inline-flex border border-[color:var(--rule)] font-mono text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={view === o.value}
          onClick={() => onChange(o.value)}
          className={
            view === o.value
              ? "bg-[color:var(--ink)] px-3 py-1 text-[color:var(--parchment)]"
              : "px-3 py-1 text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
