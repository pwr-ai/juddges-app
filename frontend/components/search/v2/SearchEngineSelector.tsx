import { StatusBadge } from "@/components/editorial";
import { cn } from "@/lib/utils";

export type SearchEngine = "standard" | "v2";

const OPTIONS: { value: SearchEngine; label: string; test?: boolean }[] = [
  { value: "standard", label: "Standard" },
  { value: "v2", label: "v2 (Weaviate, test)", test: true },
];

/** Switch between the standard search and the v2 (Weaviate) test engine. */
export function SearchEngineSelector({
  value,
  onChange,
  disabled,
}: {
  value: SearchEngine;
  onChange: (engine: SearchEngine) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
        Engine
      </span>
      <div role="radiogroup" aria-label="Search engine" className="inline-flex border border-[color:var(--rule-strong)]">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50",
                selected
                  ? "bg-[color:var(--ink)] text-[color:var(--parchment)]"
                  : "bg-transparent text-[color:var(--ink)] hover:text-[color:var(--oxblood)]"
              )}
            >
              {option.label}
              {option.test && (
                <StatusBadge status="test" tone={selected ? "gold" : "oxblood"} label="TEST" size="sm" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
