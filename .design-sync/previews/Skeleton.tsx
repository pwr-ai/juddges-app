import * as React from "react";
import { Skeleton } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-sm">
    <Skeleton className="h-4 w-full" />
  </div>
);

export const TextBlock = () => (
  <div className="grid max-w-sm gap-2">
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
  </div>
);

export const JudgmentCard = () => (
  <div className="flex max-w-md flex-col gap-4 rounded-xl border border-[color:var(--rule)] p-6">
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    <div className="grid gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-6 w-28" />
    </div>
  </div>
);

export const ResultList = () => (
  <div className="grid max-w-md gap-4">
    {[0, 1, 2].map((i) => (
      <div key={i} className="grid gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    ))}
  </div>
);
