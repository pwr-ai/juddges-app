import * as React from "react";
import { Checkbox, Input, Label } from "@juddges/design-system";

export const Default = () => <Label>Case number</Label>;

export const WithInput = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="citation">Neutral citation</Label>
    <Input id="citation" defaultValue="[2023] EWCA Crim 281" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="anon" defaultChecked />
    <Label htmlFor="anon">Include anonymised judgments</Label>
  </div>
);

export const DisabledPeer = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="archived" disabled />
    <Label htmlFor="archived">Include archived judgments (unavailable)</Label>
  </div>
);
