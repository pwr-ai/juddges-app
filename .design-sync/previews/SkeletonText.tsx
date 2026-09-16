import * as React from "react";
import { SkeletonText } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-md">
    <SkeletonText />
  </div>
);

export const Paragraph = () => (
  <div className="max-w-md">
    <SkeletonText lines={6} />
  </div>
);

export const CustomWidths = () => (
  <div className="max-w-md">
    <SkeletonText lines={3} widths={["40%", "100%", "85%"]} />
  </div>
);

export const HeadlineAndBody = () => (
  <div className="grid max-w-md gap-4">
    <SkeletonText lines={1} widths={["60%"]} />
    <SkeletonText lines={4} />
  </div>
);
