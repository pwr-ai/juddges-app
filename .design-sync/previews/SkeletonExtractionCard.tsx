import * as React from "react";
import { SkeletonExtractionCard } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-sm">
    <SkeletonExtractionCard />
  </div>
);

export const Stacked = () => (
  <div className="flex max-w-sm flex-col gap-2">
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
      Extracting 4 fields from II AKa 47/23
    </p>
    <SkeletonExtractionCard />
    <SkeletonExtractionCard />
    <SkeletonExtractionCard />
    <SkeletonExtractionCard />
  </div>
);

export const Wide = () => (
  <div className="max-w-2xl">
    <SkeletonExtractionCard className="p-3" />
  </div>
);
