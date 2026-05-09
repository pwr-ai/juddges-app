import React from "react";
import { cn } from "@/lib/utils";

interface DropCapProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Body text — the first character automatically becomes the cap. */
  children: React.ReactNode;
  /** Tone of the dropped initial. */
  tone?: "oxblood" | "ink" | "gold";
}

/**
 * Drop-cap paragraph. Uses CSS `::first-letter` so plain text content works
 * out of the box — pass a string or a single text-leading node as children.
 *
 * @example
 *   <DropCap>The JuDDGES project aims to revolutionize…</DropCap>
 */
export function DropCap({
  tone = "oxblood",
  className,
  children,
  ...props
}: DropCapProps) {
  const toneStyle =
    tone === "ink"
      ? { ["--dropcap-color" as string]: "var(--ink)" }
      : tone === "gold"
        ? { ["--dropcap-color" as string]: "var(--gold)" }
        : { ["--dropcap-color" as string]: "var(--oxblood)" };

  return (
    <p
      style={toneStyle as React.CSSProperties}
      className={cn(
        "editorial-dropcap text-lg leading-[1.65] text-[color:var(--ink-soft)]",
        "[&::first-letter]:text-[color:var(--dropcap-color)]",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export default DropCap;
