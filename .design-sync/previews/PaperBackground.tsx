import * as React from "react";
import { PaperBackground, Headline } from "@juddges/design-system";

const Hero = () => (
  <div className="relative z-10 max-w-2xl">
    <Headline as="h2" size="md">
      Read the <em>reasoning</em>, not just the result
    </Headline>
    <p className="mt-4 text-[15px] leading-[1.65] text-ink-soft">
      Every judgment in the archive is split into facts, submissions and the
      court&apos;s reasoning, so that a search for &quot;abuse of process&quot; lands on
      the paragraph where the Court of Appeal actually decided the point.
    </p>
  </div>
);

export const Default = () => (
  <PaperBackground className="p-8">
    <Hero />
  </PaperBackground>
);

export const Grain = () => (
  <PaperBackground grain className="p-8">
    <Hero />
  </PaperBackground>
);

export const Deep = () => (
  <PaperBackground deep className="p-8">
    <Hero />
  </PaperBackground>
);

export const DeepGrain = () => (
  <PaperBackground deep grain className="p-8">
    <Hero />
  </PaperBackground>
);
