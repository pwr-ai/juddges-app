"use client";

import React from "react";

import { cn } from "@/lib/utils";
import type { SearchMode } from "@/lib/store/searchStore";

export interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  disabled?: boolean;
  className?: string;
}

// Hybrid is hidden while the Meilisearch bge-m3 embedder is unregistered
// (issue #200). Restore the option once hybrid stops returning 502s.
const OPTIONS: Array<{ value: SearchMode; label: string; hint: string }> = [
  { value: "text", label: "Text", hint: "Lexical full-text via Meilisearch" },
  { value: "vector", label: "Vector", hint: "Semantic similarity via pgvector" },
];

export function SearchModeToggle({
  mode,
  onChange,
  disabled,
  className,
}: SearchModeToggleProps): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Search mode"
      className={cn(
        "inline-flex w-full items-stretch rounded-md border border-[color:var(--rule)]",
        "bg-[color:var(--parchment)] p-0.5 font-mono text-[11px] uppercase tracking-wider",
        className
      )}
    >
      {OPTIONS.map((opt) => {
        const selected = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${opt.label} — ${opt.hint}`}
            title={opt.hint}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-sm px-3 py-2 transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--oxblood)]",
              selected
                ? "bg-[color:var(--ink)] text-[color:var(--parchment)]"
                : "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
