import * as React from "react";
import { SkeletonSearch, Headline } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-2xl">
    <SkeletonSearch />
  </div>
);

export const Narrow = () => (
  <div className="max-w-md">
    <SkeletonSearch />
  </div>
);

export const UnderHeadline = () => (
  <div className="flex max-w-2xl flex-col gap-4">
    <Headline as="h2" size="md">
      Search <em>47,000+ judgments</em>
    </Headline>
    <SkeletonSearch />
    <p className="text-sm text-[color:var(--ink-soft)]">Search bar placeholder while the index handshake completes.</p>
  </div>
);
