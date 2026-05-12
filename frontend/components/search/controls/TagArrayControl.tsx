"use client";
import React, { useState, useMemo } from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface TagArrayControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "tag_array" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "tag_array" }> | undefined) => void;
  facetCounts?: Record<string, number>;
  onQueryChange?: (q: string) => void;
  disabled?: boolean;
}

export function TagArrayControl({
  label, description, value, onChange, facetCounts, onQueryChange, disabled,
}: TagArrayControlProps) {
  const [input, setInput] = useState("");
  const selected = useMemo(() => value?.values ?? [], [value?.values]);

  const suggestions = useMemo(() => {
    if (!facetCounts) return [] as Array<[string, number]>;
    const q = input.toLowerCase();
    return Object.entries(facetCounts)
      .filter(([k]) => !selected.includes(k) && k.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [facetCounts, input, selected]);

  const update = (next: string[]) => {
    if (next.length === 0) onChange(undefined);
    else onChange({ kind: "tag_array", values: next });
  };
  const add = (v: string) => {
    if (selected.includes(v)) return;
    update([...selected, v]);
    setInput("");
  };
  const remove = (v: string) => update(selected.filter((s) => s !== v));

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">{label}</label>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}
      <div className="flex flex-wrap items-center gap-1 rounded border border-[color:var(--rule)] bg-white px-2 py-1">
        {selected.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded bg-[color:var(--gold-soft)] px-1 text-[11px] text-[color:var(--ink)]"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => remove(v)}
              disabled={disabled}
              className="leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          disabled={disabled}
          aria-label={label}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              add(input.trim());
            }
          }}
          className="flex-1 min-w-[6ch] bg-transparent text-xs text-[color:var(--ink)] outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-[color:var(--rule)] bg-white text-xs shadow-sm">
          {suggestions.map(([v, n]) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => add(v)}
                className="flex w-full items-center justify-between px-2 py-1 hover:bg-[color:var(--parchment-deep)] text-[color:var(--ink)]"
              >
                <span>{v}</span>
                <span className="text-[10px] text-[color:var(--ink-soft)]">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
