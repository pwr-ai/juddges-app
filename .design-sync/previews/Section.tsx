import * as React from "react";
import { Section, DualStatCard, Stat } from "@juddges/design-system";

export const Default = () => (
  <div style={{ paddingTop: 56 }}>
    <Section
      numeral="01"
      eyebrow="Overview"
      title={<>Key <em>statistics</em> across both jurisdictions</>}
      description="A snapshot of the corpus as of March 2026 — judgment counts, average length and the number of distinct judges named in each jurisdiction."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DualStatCard label="Total judgments" ukValue={6050} plValue={6050} />
        <DualStatCard label="Avg. words per judgment" ukValue={4812} plValue={7364} />
        <DualStatCard label="Judges named" ukValue={412} plValue={1287} />
      </div>
    </Section>
  </div>
);

export const NoDescription = () => (
  <div style={{ paddingTop: 56 }} className="ds-stat-settled">
    {/* Stat's framer-motion wrapper never animates in under the capture's pinned clock. */}
    <style>{`.ds-stat-settled [style*="opacity"]{opacity:1!important;transform:none!important}`}</style>
    <Section numeral="02" eyebrow="Temporal" title="Judgments per year">
      <div className="grid grid-cols-3 gap-8">
        <Stat static value={47000} suffix="+" label="Polish judgments" />
        <Stat static value={6050} label="E&W Court of Appeal" />
        <Stat static value={12} label="Years covered" />
      </div>
    </Section>
  </div>
);

export const Plain = () => (
  <Section
    title="Methodology"
    description="Facts, submissions and reasoning are extracted with a schema-guided agent and verified against a hand-annotated sample."
  >
    <p className="max-w-2xl text-[15px] leading-[1.65] text-ink-soft">
      The annotation guidelines follow the Polish Code of Criminal Procedure
      (k.p.k.) for the PL corpus and the Criminal Procedure Rules for E&amp;W.
    </p>
  </Section>
);
