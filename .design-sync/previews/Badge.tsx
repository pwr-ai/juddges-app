import * as React from "react";
import { Badge } from "@juddges/design-system";

export const Default = () => <Badge>Criminal</Badge>;

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Criminal</Badge>
    <Badge variant="secondary">Court of Appeal</Badge>
    <Badge variant="outline">II AKa 123/21</Badge>
    <Badge variant="destructive">Conviction upheld</Badge>
  </div>
);

export const JudgmentMetadata = () => (
  <div className="flex max-w-md flex-col gap-2">
    <p className="text-sm font-medium text-[color:var(--ink)]">
      Wyrok Sądu Apelacyjnego w Warszawie z dnia 14 marca 2023 r.
    </p>
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">II AKa 412/22</Badge>
      <Badge variant="secondary">Sąd Apelacyjny w Warszawie</Badge>
      <Badge>Criminal</Badge>
      <Badge variant="secondary">art. 286 § 1 k.k.</Badge>
    </div>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Extracted
    </Badge>
    <Badge variant="outline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      Pending review
    </Badge>
    <Badge variant="destructive">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
      Overruled
    </Badge>
  </div>
);
