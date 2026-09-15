import * as React from "react";
import { Input, Label } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-sm">
    <Input placeholder="Search judgments, e.g. limitation period in contract" />
  </div>
);

export const WithLabel = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="case-no">Case number</Label>
    <Input id="case-no" defaultValue="II AKa 123/21" />
  </div>
);

export const Types = () => (
  <div className="grid max-w-sm gap-3">
    <Input type="email" placeholder="judge@sa.gov.pl" />
    <Input type="date" defaultValue="2023-03-21" />
    <Input type="number" placeholder="Max results" defaultValue={25} />
    <Input type="file" />
  </div>
);

export const States = () => (
  <div className="grid max-w-sm gap-3">
    <Input defaultValue="Sąd Apelacyjny w Warszawie" disabled />
    <Input aria-invalid defaultValue="[2023] EWCA Crim" placeholder="Citation" />
    <Input readOnly defaultValue="Read-only: Rex v Brown [2022] EWCA Crim 1160" />
  </div>
);
