import * as React from "react";
import { Loader } from "@juddges/design-system";

export const Default = () => <Loader />;

export const Sizes = () => (
  <div className="flex items-center gap-6">
    <Loader size="sm" />
    <Loader size="md" />
    <Loader size="lg" />
  </div>
);

export const Variants = () => (
  <div className="flex items-center gap-4">
    <div className="flex flex-col items-center gap-2 rounded-md border border-rule bg-parchment px-5 py-4">
      <Loader variant="default" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">default</span>
    </div>
    <div className="flex flex-col items-center gap-2 rounded-md bg-oxblood px-5 py-4">
      <Loader variant="secondary" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-parchment">secondary</span>
    </div>
    <div className="flex flex-col items-center gap-2 rounded-md border border-rule bg-parchment px-5 py-4">
      <Loader variant="ghost" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">ghost</span>
    </div>
  </div>
);

export const WithLabel = () => (
  <div className="flex items-center gap-3 text-sm text-[color:var(--ink-soft)]">
    <Loader size="sm" />
    <span>Searching 47,523 judgments…</span>
  </div>
);
