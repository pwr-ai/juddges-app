import * as React from "react";
import { Button } from "@juddges/design-system";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export const Default = () => <Button>Search judgments</Button>;

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Search judgments</Button>
    <Button variant="secondary">Save to collection</Button>
    <Button variant="outline">Export citation</Button>
    <Button variant="ghost">Clear filters</Button>
    <Button variant="link">View full text</Button>
    <Button variant="destructive">Delete collection</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Cite</Button>
    <Button size="default">Open judgment</Button>
    <Button size="lg">Run extraction</Button>
    <Button size="icon" aria-label="Search">
      <SearchIcon />
    </Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <SearchIcon />
      Semantic search
    </Button>
    <Button variant="outline">
      Next judgment
      <ArrowIcon />
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Search judgments</Button>
    <Button variant="secondary" disabled>Save to collection</Button>
    <Button variant="outline" disabled>Export citation</Button>
  </div>
);
