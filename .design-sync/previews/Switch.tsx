import * as React from "react";
import { Label, Switch } from "@juddges/design-system";

export const Default = () => (
  <div className="flex items-center gap-2">
    <Switch id="semantic" defaultChecked />
    <Label htmlFor="semantic">Semantic search</Label>
  </div>
);

export const States = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Switch id="sw-off" />
      <Label htmlFor="sw-off">Off</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="sw-on" defaultChecked />
      <Label htmlFor="sw-on">On</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="sw-dis" disabled />
      <Label htmlFor="sw-dis">Disabled</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="sw-dis-on" disabled defaultChecked />
      <Label htmlFor="sw-dis-on">Disabled, on</Label>
    </div>
  </div>
);

export const SettingsList = () => (
  <div className="flex max-w-sm flex-col divide-y divide-[color:var(--rule)]">
    <div className="flex items-center justify-between py-3">
      <div className="grid gap-0.5">
        <Label htmlFor="opt-pl">Polish courts</Label>
        <p className="text-xs text-[color:var(--ink-soft)]">Sąd Najwyższy, apelacyjne, okręgowe</p>
      </div>
      <Switch id="opt-pl" defaultChecked />
    </div>
    <div className="flex items-center justify-between py-3">
      <div className="grid gap-0.5">
        <Label htmlFor="opt-ew">England &amp; Wales</Label>
        <p className="text-xs text-[color:var(--ink-soft)]">Court of Appeal, Crown Court</p>
      </div>
      <Switch id="opt-ew" defaultChecked />
    </div>
    <div className="flex items-center justify-between py-3">
      <div className="grid gap-0.5">
        <Label htmlFor="opt-cite">Auto-cite on copy</Label>
        <p className="text-xs text-[color:var(--ink-soft)]">Append OSCOLA citation to copied text</p>
      </div>
      <Switch id="opt-cite" />
    </div>
  </div>
);
