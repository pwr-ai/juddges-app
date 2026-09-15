import * as React from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@juddges/design-system";

const CourtItems = () => (
  <SelectContent>
    <SelectItem value="sn">Sąd Najwyższy</SelectItem>
    <SelectItem value="sa-warszawa">Sąd Apelacyjny w Warszawie</SelectItem>
    <SelectItem value="sa-krakow">Sąd Apelacyjny w Krakowie</SelectItem>
    <SelectItem value="ewca-crim">Court of Appeal (Criminal Division)</SelectItem>
    <SelectItem value="ewca-civ">Court of Appeal (Civil Division)</SelectItem>
  </SelectContent>
);

export const Default = () => (
  <div className="max-w-xs">
    <Select defaultValue="sa-warszawa">
      <SelectTrigger>
        <SelectValue placeholder="Select a court" />
      </SelectTrigger>
      <CourtItems />
    </Select>
  </div>
);

export const Placeholder = () => (
  <div className="max-w-xs">
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select a court" />
      </SelectTrigger>
      <CourtItems />
    </Select>
  </div>
);

export const WithLabel = () => (
  <div className="grid max-w-xs gap-2">
    <Label htmlFor="sort">Sort results by</Label>
    <Select defaultValue="date-desc">
      <SelectTrigger id="sort">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="relevance">Relevance</SelectItem>
        <SelectItem value="date-desc">Judgment date, newest first</SelectItem>
        <SelectItem value="date-asc">Judgment date, oldest first</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

export const Disabled = () => (
  <div className="max-w-xs">
    <Select defaultValue="ewca-crim" disabled>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <CourtItems />
    </Select>
  </div>
);
