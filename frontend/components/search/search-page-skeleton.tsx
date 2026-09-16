"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { EditorialCardSkeleton } from "@/components/editorial";
import { cn } from "@/lib/utils";

export function SearchPageSkeleton() {
  return (
    <div
      className={cn(
        "container mx-auto px-4 md:px-8 max-w-6xl",
        "animate-in fade-in duration-150"
      )}
      style={{
        paddingTop: "clamp(1.5rem, 3vh, 2.5rem)",
        paddingBottom: "clamp(2rem, 4vh, 3rem)",
      }}
    >
      {/* Wrapper for centered content */}
      <div className="flex flex-col items-center">
        {/* Header skeleton */}
        <div className="w-full text-center mb-6 md:mb-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-9 w-64" />
            </div>
            <Skeleton className="h-5 w-96 max-w-full" />
          </div>
        </div>

        {/* Search form skeleton */}
        <div className="relative mb-6 md:mb-8 w-full max-w-3xl">
          <div className="space-y-4 px-4 md:px-6 py-4 border border-rule bg-parchment">
            {/* Search options skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-rule">
              {/* Document Type */}
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-40" />
                </div>
              </div>

              {/* Mode */}
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>

              {/* Language */}
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </div>

            {/* Search bar skeleton */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Skeleton className="h-14 w-full" />
              </div>
              <Skeleton className="h-14 w-32" />
            </div>

            {/* Popular searches skeleton */}
            <div className="flex items-center flex-wrap gap-3 pt-3">
              <Skeleton className="h-4 w-32" />
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          </div>
        </div>

        {/* Example queries skeleton */}
        <div className="mb-6 md:mb-8 w-full">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <EditorialCardSkeleton
                key={i}
                minHeight="180px"
                lines={2}
                hasFooter={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
