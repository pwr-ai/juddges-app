"use client";
import React from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface EnumMultiControlProps {
  label: string;
  description?: string;
  options: readonly string[];
  optionLabel?: (v: string) => string;
  value: Extract<BaseFilterValue, { kind: "enum_multi" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "enum_multi" }> | undefined) => void;
  disabled?: boolean;
}

export function EnumMultiControl({
  label, description, options, optionLabel, value, onChange, disabled,
}: EnumMultiControlProps) {
  const selected = new Set(value?.values ?? []);
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    if (next.size === 0) onChange(undefined);
    else onChange({ kind: "enum_multi", values: Array.from(next) });
  };
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-xs font-medium text-[color:var(--ink)]">{label}</legend>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt) => {
          const text = optionLabel?.(opt) ?? opt;
          return (
            <label key={opt} className="flex items-center gap-1 text-xs text-[color:var(--ink)]">
              <input
                type="checkbox" disabled={disabled}
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                aria-label={text}
              />
              <span>{text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
