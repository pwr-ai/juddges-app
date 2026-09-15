import * as React from "react";
import { DualStatCard } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-xs">
    <DualStatCard label="Total judgments" ukValue={6050} plValue={6050} />
  </div>
);

export const WithFormat = () => (
  <div className="max-w-xs">
    <DualStatCard label="Avg. sentence length" ukValue={18.2} plValue={22.7} format=" words" />
  </div>
);

export const CustomLabels = () => (
  <div className="max-w-xs">
    <DualStatCard
      label="Appeals allowed"
      leftLabel="Crim Div"
      rightLabel="SA Wrocław"
      ukValue="31%"
      plValue="24%"
    />
  </div>
);

export const Grid = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <DualStatCard label="Total judgments" ukValue={6050} plValue={6050} />
    <DualStatCard label="Avg. words per judgment" ukValue={4812} plValue={7364} />
    <DualStatCard label="Judges named" ukValue={412} plValue={1287} />
  </div>
);
