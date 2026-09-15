import * as React from "react";
import { Label, Slider } from "@juddges/design-system";

export const Default = () => (
  <div className="w-64">
    <Slider defaultValue={[40]} max={100} step={1} />
  </div>
);

export const Range = () => (
  <div className="grid w-64 gap-2">
    <div className="flex items-center justify-between text-sm">
      <Label>Judgment year</Label>
      <span className="font-mono tabular-nums text-[color:var(--ink-soft)]">2015 – 2022</span>
    </div>
    <Slider defaultValue={[2015, 2022]} min={2000} max={2024} step={1} />
  </div>
);

export const WithSteps = () => (
  <div className="grid w-64 gap-2">
    <div className="flex items-center justify-between text-sm">
      <Label>Similarity threshold</Label>
      <span className="font-mono tabular-nums text-[color:var(--ink-soft)]">0.75</span>
    </div>
    <Slider defaultValue={[75]} min={0} max={100} step={5} />
  </div>
);

export const Disabled = () => (
  <div className="w-64">
    <Slider defaultValue={[60]} max={100} disabled />
  </div>
);

export const Vertical = () => (
  <div className="flex h-48 items-center gap-6">
    <Slider orientation="vertical" defaultValue={[30]} max={100} />
    <Slider orientation="vertical" defaultValue={[20, 70]} max={100} />
  </div>
);
