"use client";

import { useTranslation } from "@/contexts/LanguageContext";
import { SCALE_STOPS } from "@/lib/extractions/aggregate-fields";

export interface ScaleSliderProps {
  cohortTotal: number;
  sampleSize: number | undefined;
  seed: number;
  onChange: (sampleSize: number | undefined) => void;
  onReshuffle: () => void;
}

/**
 * Discrete sample-size stops 10 · 50 · 100 · 1,000 · 5,000 · all (#708).
 * Stops larger than the cohort are disabled; "all" is `undefined`. A
 * `sampleSize` above the cohort (URL from a wider cohort) displays as "all".
 */
export function ScaleSlider({ cohortTotal, sampleSize, seed, onChange, onReshuffle }: ScaleSliderProps) {
  const { t } = useTranslation();
  const effective = sampleSize !== undefined && sampleSize > cohortTotal ? undefined : sampleSize;
  const stops: { value: number | undefined; label: string }[] = [
    ...SCALE_STOPS.map((n) => ({ value: n, label: n.toLocaleString("en-US") })),
    { value: undefined, label: t("extraction.statsAll") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[color:var(--ink-soft)]">
      <span>{t("extraction.statsScale")}</span>
      <div role="radiogroup" aria-label={t("extraction.statsScale")} className="inline-flex border border-[color:var(--rule)]">
        {stops.map((s) => {
          const disabled = s.value !== undefined && s.value > cohortTotal;
          const checked = s.value === effective;
          return (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => onChange(s.value)}
              className={
                checked
                  ? "bg-[color:var(--ink)] px-2 py-1 text-[color:var(--parchment)]"
                  : "px-2 py-1 disabled:opacity-40 hover:text-[color:var(--ink)]"
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {effective !== undefined && (
        <>
          <span>seed {seed}</span>
          <button type="button" onClick={onReshuffle} className="underline hover:text-[color:var(--ink)]">
            {t("extraction.statsReshuffle")}
          </button>
        </>
      )}
    </div>
  );
}
