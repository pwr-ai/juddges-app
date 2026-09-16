import { FC } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorialCardSkeleton } from "@/components/editorial";

/** Full-page loading skeleton shown while the collection is being fetched. */
const CollectionLoadingSkeleton: FC = () => {
  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1600px]">
      {/* Header skeleton */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-8 w-16" />
            </div>
            <div className="h-0.5 w-16 bg-rule" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      {/* Document cards skeleton */}
      <div className="mt-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <EditorialCardSkeleton
              key={i}
              minHeight="360px"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollectionLoadingSkeleton;
