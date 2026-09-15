import * as React from "react";
import { SectionHeader } from "@juddges/design-system";

export const Default = () => (
  <div style={{ paddingTop: 56 }}>
    <SectionHeader
      eyebrow="Capabilities"
      numeral="03"
      title={<>Three ways to <em>work with</em> legal data</>}
      description="Search across 50,000 judgments, analyse reasoning patterns by court and judge, and extract structured facts into a schema you define."
    />
  </div>
);

export const Centered = () => (
  <div style={{ paddingTop: 56 }}>
    <SectionHeader
      align="center"
      eyebrow="Coverage"
      numeral="02"
      title={<>Two jurisdictions, <em>one</em> archive</>}
      description="Polish common courts alongside the England and Wales Court of Appeal."
    />
  </div>
);

export const WithAction = () => (
  <SectionHeader
    eyebrow="Recent"
    title="Latest judgments ingested"
    action={
      <a href="#" className="font-mono text-[11px] uppercase tracking-[0.18em] text-oxblood">
        Browse all →
      </a>
    }
  />
);

export const TitleOnly = () => <SectionHeader title="Sąd Apelacyjny we Wrocławiu" />;
