import * as React from "react";
import { SkeletonCard } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-md">
    <SkeletonCard />
  </div>
);

export const LongBody = () => (
  <div className="max-w-md">
    <SkeletonCard contentLines={4} />
  </div>
);

export const NoMetadata = () => (
  <div className="max-w-md">
    <SkeletonCard showMetadata={false} contentLines={1} />
  </div>
);

export const ResultGrid = () => (
  <div className="grid max-w-3xl grid-cols-1 gap-px bg-pwr-line sm:grid-cols-2">
    {[0, 1, 2, 3].map((i) => (
      <SkeletonCard key={i} className="rounded-none border-0 bg-pwr-paper" />
    ))}
  </div>
);
