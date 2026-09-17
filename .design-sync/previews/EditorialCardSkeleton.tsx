import * as React from "react";
import { EditorialCardSkeleton } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-md">
    <EditorialCardSkeleton />
  </div>
);

export const Minimal = () => (
  <div className="max-w-md">
    <EditorialCardSkeleton hasEyebrow={false} hasAction={false} hasFooter={false} lines={2} minHeight={160} />
  </div>
);

export const LongBody = () => (
  <div className="max-w-md">
    <EditorialCardSkeleton lines={6} minHeight={320} />
  </div>
);

export const Grid = () => (
  <div className="grid max-w-3xl grid-cols-1 gap-px bg-pwr-line sm:grid-cols-2">
    {[0, 1, 2, 3].map((i) => (
      <EditorialCardSkeleton key={i} minHeight={200} lines={2} />
    ))}
  </div>
);
