import * as React from "react";
import { Eyebrow } from "@juddges/design-system";

export const Default = () => <Eyebrow>About the project</Eyebrow>;

export const Tones = () => (
  <div className="flex flex-col gap-4">
    <Eyebrow>Default — ink soft</Eyebrow>
    <Eyebrow tone="oxblood">Database</Eyebrow>
    <Eyebrow tone="gold">Citation gold</Eyebrow>
  </div>
);

export const NoRule = () => (
  <div className="flex flex-wrap items-center gap-6">
    <Eyebrow noRule>Court of Appeal</Eyebrow>
    <Eyebrow noRule tone="oxblood">Sąd Najwyższy</Eyebrow>
    <Eyebrow noRule tone="gold">Vol I · No 4</Eyebrow>
  </div>
);

export const BlockLevel = () => (
  <div className="max-w-md">
    <Eyebrow as="p" tone="oxblood">Chapter III · Reasoning</Eyebrow>
    <p className="mt-2 text-[15px] leading-[1.65] text-ink-soft">
      Rendered as a paragraph, the eyebrow sits on its own line above the body copy.
    </p>
  </div>
);
