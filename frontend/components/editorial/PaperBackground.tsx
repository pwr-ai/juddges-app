import React from "react";
import { cn } from "@/lib/utils";

interface PaperBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Accepted for backwards compatibility; paper grain was retired with the
   * PWr identity (#629). Has no visual effect.
   */
  grain?: boolean;
  /** Render with the SIW grey panel tone instead of white. */
  deep?: boolean;
}

/**
 * Surface wrapper that paints the PWr white paper (or the grey info panel
 * with `deep`). Use as a section wrapper for hero / immersive areas.
 *
 * @example
 *   <PaperBackground className="py-24"><HeroContent /></PaperBackground>
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
        deep ? "bg-pwr-panel" : "bg-pwr-paper",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default PaperBackground;
