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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const text = optionLabel?.(opt) ?? opt;
          const isChecked = selected.has(opt);
          return (
            <label
              key={opt}
              className={`flex items-start gap-1.5 rounded px-1.5 py-1 text-xs transition-colors cursor-pointer select-none ${
                isChecked
                  ? "bg-[color:var(--gold-soft)]/50 text-[color:var(--ink)] font-medium"
                  : "text-[color:var(--ink)] hover:bg-black/5"
              }`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={isChecked}
                onChange={() => toggle(opt)}
                aria-label={text}
                className="mt-0.5 h-3.5 w-3.5 rounded border-[color:var(--rule-strong)] text-[color:var(--oxblood)] accent-[color:var(--oxblood)] focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50 cursor-pointer"
              />
              <span className="leading-tight break-words">{text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
