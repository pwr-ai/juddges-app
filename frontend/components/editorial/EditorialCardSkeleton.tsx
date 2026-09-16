import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface EditorialCardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional minimum height for the card skeleton */
  minHeight?: string | number;
  /** Whether to show header eyebrow placeholder */
  hasEyebrow?: boolean;
  /** Whether to show action / badge slot placeholder */
  hasAction?: boolean;
  /** Number of content lines to render in the body */
  lines?: number;
  /** Whether to show footer slots */
  hasFooter?: boolean;
}

/**
 * Canonical card skeleton for Editorial Jurisprudence surfaces.
 * Built with sharp editorial edges and standard Skeleton pulse primitives.
 */
export function EditorialCardSkeleton({
  minHeight = "260px",
  hasEyebrow = true,
  hasAction = true,
  lines = 3,
  hasFooter = true,
  className,
  style,
  ...props
}: EditorialCardSkeletonProps) {
  return (
    <div
      className={cn(
        "editorial-card relative flex flex-col p-5 sm:p-6",
        className
      )}
      style={{ minHeight, ...style }}
      {...props}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          {hasEyebrow && <Skeleton className="h-3 w-20" />}
          <Skeleton className="h-6 w-3/4" />
        </div>
        {hasAction && <Skeleton className="h-5 w-16 shrink-0" />}
      </div>

      {/* Body content */}
      <div className="flex-1 space-y-2 mb-4">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-4",
              i === lines - 1 ? "w-2/3" : i === 0 ? "w-full" : "w-5/6"
            )}
          />
        ))}
      </div>

      {/* Footer / tags */}
      {hasFooter && (
        <div className="mt-auto pt-3 border-t border-[color:var(--rule)] flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      )}
    </div>
  );
}

export default EditorialCardSkeleton;
