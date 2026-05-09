import React from "react";
import { cn } from "@/lib/utils";

interface CitationProps extends React.HTMLAttributes<HTMLElement> {
  /** Marker character — `¹`, `²`, `*`, `†`. */
  marker?: string;
  /** Auto-numbered marker derived from index. */
  index?: number;
}

const SUPER_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPER_DIGITS[Number(d)])
    .join("");
}

/**
 * Inline citation marker — superscripted, monospace, gold-toned. Used to
 * cross-reference footnote-style detail in stat strips and editorial copy.
 *
 * @example
 *   <p>47K judgments<Citation index={1} /></p>
 */
export function Citation({
  marker,
  index,
  className,
  ...props
}: CitationProps) {
  const text = marker ?? (typeof index === "number" ? toSuperscript(index) : "*");
  return (
    <sup
      className={cn(
        "ml-0.5 font-mono text-[10px] font-medium tracking-tight text-[color:var(--gold)]",
        className,
      )}
      {...props}
    >
      {text}
    </sup>
  );
}

export default Citation;
