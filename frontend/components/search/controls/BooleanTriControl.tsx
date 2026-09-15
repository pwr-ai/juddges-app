"use client";
import React from "react";
import type { BaseFilterValue } from "@/lib/store/searchStore";

export interface BooleanTriControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "boolean_tri" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "boolean_tri" }> | undefined) => void;
  disabled?: boolean;
}

// Declared at module scope, not inside BooleanTriControl. A component created
// during render gets a new identity every time, so React unmounts and remounts
// the buttons on each render instead of updating them — losing focus mid-click.
function Pill({
  active,
  text,
  action,
  disabled,
}: {
  active: boolean;
  text: string;
  action: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={action}
      className={`px-2 py-1 text-xs rounded border border-[color:var(--rule)] ${
        active ? "bg-[color:var(--ink)] text-[color:var(--parchment)]" : "bg-white text-[color:var(--ink)]"
      } disabled:opacity-50`}
    >
      {text}
    </button>
  );
}

export function BooleanTriControl({ label, description, value, onChange, disabled }: BooleanTriControlProps) {
  const v = value?.value;
  const set = (next: true | false | undefined) => {
    if (next === undefined) onChange(undefined);
    else onChange({ kind: "boolean_tri", value: next });
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">{label}</label>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}
      <div className="flex gap-1">
        <Pill active={v === undefined} text="Any" action={() => set(undefined)} disabled={disabled} />
        <Pill active={v === true} text="Yes" action={() => set(true)} disabled={disabled} />
        <Pill active={v === false} text="No" action={() => set(false)} disabled={disabled} />
      </div>
    </div>
  );
}
