import * as React from "react";
import { Headline } from "@juddges/design-system";

export const HeroDisplay = () => (
  <Headline as="h1" size="lg">
    An open archive of <em>judicial reasoning</em>, read by machines.
  </Headline>
);

export const SectionTitle = () => (
  <Headline as="h2" size="md">
    Three ways to <em>work</em> with legal data
  </Headline>
);

export const Sizes = () => (
  <div className="flex flex-col gap-6">
    <Headline as="h3" size="xs">Extra small — card-level title</Headline>
    <Headline as="h3" size="sm">Small — sub-section heading</Headline>
    <Headline as="h2" size="md">Medium — section heading</Headline>
  </div>
);

export const Tones = () => (
  <div className="flex flex-col gap-4">
    <Headline size="sm" tone="ink">Ink — the default headline colour</Headline>
    <Headline size="sm" tone="oxblood">Oxblood — authority and emphasis</Headline>
    <Headline size="sm" tone="ink-soft">Ink soft — secondary headlines</Headline>
    <Headline size="sm" italic>Italic — the whole line in editorial emphasis</Headline>
  </div>
);
