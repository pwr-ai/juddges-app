import * as React from "react";
import { EditorialCard } from "@juddges/design-system";

const Body = () => (
  <p className="text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
    47,000+ judgments from Polish common courts and the England &amp; Wales Court
    of Appeal, with full text, metadata and machine-extracted reasoning.
  </p>
);

export const Default = () => (
  <EditorialCard eyebrow="Database" title="Comprehensive coverage">
    <Body />
  </EditorialCard>
);

export const WithAction = () => (
  <EditorialCard
    eyebrow="Recent"
    title="Conversations"
    action={
      <a href="#" className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--oxblood)]">
        View all →
      </a>
    }
  >
    <ul className="flex flex-col divide-y divide-[color:var(--rule)]">
      <li className="py-2 text-sm text-[color:var(--ink)]">Limitation periods in contract claims</li>
      <li className="py-2 text-sm text-[color:var(--ink)]">Sentencing for aggravated theft</li>
      <li className="py-2 text-sm text-[color:var(--ink)]">Custody after parental relocation</li>
    </ul>
  </EditorialCard>
);

export const Featured = () => (
  <EditorialCard featured eyebrow="Featured" title="Coverage by jurisdiction" clickable>
    <Body />
  </EditorialCard>
);

export const Variants = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <EditorialCard title="Default"><Body /></EditorialCard>
    <EditorialCard flat title="Flat"><Body /></EditorialCard>
    <EditorialCard bare title="Bare"><Body /></EditorialCard>
  </div>
);
