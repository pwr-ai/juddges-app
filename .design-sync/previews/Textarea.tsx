import * as React from "react";
import { Label, Textarea } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-md">
    <Textarea placeholder="Describe the legal question you want to research…" />
  </div>
);

export const WithLabel = () => (
  <div className="grid max-w-md gap-2">
    <Label htmlFor="annot">Annotation</Label>
    <Textarea
      id="annot"
      defaultValue="The court distinguished R v Smith on the ground that the defendant had no prior convictions and the sentencing judge failed to give credit for the early guilty plea."
    />
  </div>
);

export const States = () => (
  <div className="grid max-w-md gap-3">
    <Textarea
      disabled
      defaultValue="Uzasadnienie wyroku zostało już zatwierdzone i nie podlega edycji."
    />
    <Textarea aria-invalid placeholder="Reason for rejection (required)" />
  </div>
);
