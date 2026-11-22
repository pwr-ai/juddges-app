"use client";

import { useRef } from "react";

import { useOptionalTranslation } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import type { SearchEngine } from "@/lib/search/engine";

export type { SearchEngine } from "@/lib/search/engine";

interface EngineOption {
  value: SearchEngine;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}

/** Labels and one-line descriptions live in the i18n catalogs (`search.engine*`). */
export const ENGINE_OPTIONS: readonly EngineOption[] = [
  {
    value: "full",
    labelKey: "search.engineFullLabel",
    descriptionKey: "search.engineFullDescription",
  },
  {
    value: "curated",
    labelKey: "search.engineCuratedLabel",
    descriptionKey: "search.engineCuratedDescription",
  },
];

/** Results-header label of the active engine. */
export const ENGINE_RESULTS_KEY: Record<SearchEngine, TranslationKey> = {
  full: "search.engineFullResults",
  curated: "search.engineCuratedResults",
};

/** "Mode · corpus" split, so the mode name and the corpus get their own type. */
function splitLabel(label: string): [string, string | null] {
  const at = label.indexOf(" · ");
  return at < 0 ? [label, null] : [label.slice(0, at), label.slice(at + 3)];
}

/**
 * Top-level switch between the full corpus and the curated set, shown right
 * above the query input. A radiogroup with a roving tab stop: Tab enters the
 * selected option, the arrow keys move and select.
 */
export function SearchEngineSelector({
  value,
  onChange,
  disabled,
  fullUnavailable,
  hint,
}: {
  value: SearchEngine;
  onChange: (engine: SearchEngine) => void;
  disabled?: boolean;
  /** Set for guests: the full corpus needs a session. */
  fullUnavailable?: boolean;
  /** Inline note next to the switch (why an engine was picked, or a suggestion). */
  hint?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useOptionalTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isDisabled = (option: EngineOption): boolean =>
    !!disabled || (option.value === "full" && !!fullUnavailable);

  const move = (from: number, step: number): void => {
    for (let i = 1; i <= ENGINE_OPTIONS.length; i += 1) {
      const next = (from + step * i + ENGINE_OPTIONS.length) % ENGINE_OPTIONS.length;
      if (!isDisabled(ENGINE_OPTIONS[next])) {
        refs.current[next]?.focus();
        onChange(ENGINE_OPTIONS[next].value);
        return;
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      <div
        role="radiogroup"
        aria-label={t("search.engineSwitchLabel")}
        className="grid w-full grid-cols-1 border border-[color:var(--rule-strong)] sm:grid-cols-2"
      >
        {ENGINE_OPTIONS.map((option, index) => {
          const selected = option.value === value;
          const optionDisabled = isDisabled(option);
          const [mode, corpus] = splitLabel(t(option.labelKey));
          const unavailable =
            option.value === "full" && fullUnavailable ? t("search.engineFullUnavailable") : null;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={optionDisabled || undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!optionDisabled && !selected) onChange(option.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, -1);
                }
              }}
              className={cn(
                "flex flex-col gap-1 px-4 py-3 text-left transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--oxblood)]",
                index > 0 && "border-t border-[color:var(--rule-strong)] sm:border-t-0 sm:border-l",
                selected
                  ? "bg-[color:var(--ink)] text-[color:var(--parchment)]"
                  : "bg-[color:var(--parchment)] text-[color:var(--ink)] hover:bg-[color:var(--parchment-deep)]",
                optionDisabled && !selected && "cursor-not-allowed opacity-60 hover:bg-[color:var(--parchment)]"
              )}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-serif text-lg leading-tight">{mode}</span>
                {corpus && (
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums",
                    selected ? "text-[color:var(--gold-soft)]" : "text-[color:var(--oxblood)]"
                  )}
                >
                  · {corpus}
                </span>
                )}
              </span>
              <span
                className={cn(
                  "text-xs leading-snug",
                  selected ? "text-[color:var(--parchment)]/80" : "text-[color:var(--ink-soft)]"
                )}
              >
                {unavailable ?? t(option.descriptionKey)}
              </span>
            </button>
          );
        })}
      </div>
      {hint && (
        <div
          role="status"
          className="border-l-2 border-[color:var(--gold)] bg-[color:var(--parchment-deep)] px-3 py-2 text-sm text-[color:var(--ink)]"
        >
          {hint}
        </div>
      )}
    </div>
  );
}
