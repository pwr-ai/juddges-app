import * as React from "react";
import { Checkbox, Label } from "@juddges/design-system";

export const Default = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="crim" defaultChecked />
    <Label htmlFor="crim">Criminal</Label>
  </div>
);

export const States = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="s-unchecked" />
      <Label htmlFor="s-unchecked">Unchecked</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="s-checked" defaultChecked />
      <Label htmlFor="s-checked">Checked</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="s-disabled" disabled />
      <Label htmlFor="s-disabled">Disabled</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="s-disabled-checked" disabled defaultChecked />
      <Label htmlFor="s-disabled-checked">Disabled, checked</Label>
    </div>
  </div>
);

export const FilterGroup = () => (
  <fieldset className="flex max-w-xs flex-col gap-3">
    <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
      Court
    </legend>
    <div className="flex items-center gap-2">
      <Checkbox id="c1" defaultChecked />
      <Label htmlFor="c1">Sąd Najwyższy</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="c2" defaultChecked />
      <Label htmlFor="c2">Sądy apelacyjne</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="c3" />
      <Label htmlFor="c3">Sądy okręgowe</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="c4" />
      <Label htmlFor="c4">Court of Appeal (E&amp;W)</Label>
    </div>
  </fieldset>
);

export const WithDescription = () => (
  <div className="flex max-w-sm items-start gap-3">
    <Checkbox id="terms" defaultChecked className="mt-0.5" />
    <div className="grid gap-1">
      <Label htmlFor="terms">Include anonymised judgments</Label>
      <p className="text-sm text-[color:var(--ink-soft)]">
        Judgments where party names were redacted by the publishing court.
      </p>
    </div>
  </div>
);
