import React from "react";
import { cn } from "@/lib/utils";

interface RuleProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Visual weight of the rule. */
  weight?: "hairline" | "medium" | "ink";
  /** Render with extra vertical breathing room. */
  spaced?: boolean;
}

/**
 * Hairline horizontal rule used as the editorial divider between sections,
 * stat groups, and meta strips. Replaces ad-hoc `border-t` classes.
 *
 * @example
 *   <Rule weight="ink" spaced />
 */
export function Rule({
  weight = "hairline",
  spaced = false,
  className,
  ...props
}: RuleProps) {
  const weightClass =
    weight === "ink"
      ? "border-t-[1px] border-t-[color:var(--ink)]"
      : weight === "medium"
        ? "border-t-[1px] border-t-[color:var(--rule-strong)]"
        : "border-t-[1px] border-t-[color:var(--rule)]";

  return (
    <hr
      className={cn(
        "border-0",
        weightClass,
        spaced ? "my-8" : "my-0",
        className,
      )}
      {...props}
    />
  );
}

export default Rule;
