import React from "react";
import { cn } from "@/lib/utils";

interface PaperBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add a subtle paper-grain noise overlay. */
  grain?: boolean;
  /** Render with the deeper parchment tone. */
  deep?: boolean;
}

/**
 * Atmospheric wrapper that paints the parchment surface with optional
 * paper-grain noise. Use as a section wrapper for hero / immersive areas.
 *
 * @example
 *   <PaperBackground grain className="py-24"><HeroContent /></PaperBackground>
 */
export function PaperBackground({
  grain = false,
  deep = false,
  className,
  children,
  ...props
}: PaperBackgroundProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        deep ? "bg-[color:var(--parchment-deep)]" : "bg-[color:var(--parchment)]",
        grain && "editorial-paper",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default PaperBackground;
