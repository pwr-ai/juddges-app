import * as React from "react";
import { Rule } from "@juddges/design-system";

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">{children}</p>
);

export const Weights = () => (
  <div className="flex max-w-xl flex-col gap-6">
    <div>
      <Label>hairline</Label>
      <Rule weight="hairline" />
    </div>
    <div>
      <Label>medium</Label>
      <Rule weight="medium" />
    </div>
    <div>
      <Label>ink</Label>
      <Rule weight="ink" />
    </div>
  </div>
);

export const Spaced = () => (
  <div className="grid max-w-3xl grid-cols-2 gap-8">
    <div>
      <Label>spaced = false</Label>
      <p className="text-[15px] text-ink">R v Jogee [2016] UKSC 8</p>
      <Rule weight="ink" />
      <p className="text-[15px] text-ink">R v Johnson [2016] EWCA Crim 1613</p>
    </div>
    <div>
      <Label>spaced</Label>
      <p className="text-[15px] text-ink">R v Jogee [2016] UKSC 8</p>
      <Rule weight="ink" spaced />
      <p className="text-[15px] text-ink">R v Johnson [2016] EWCA Crim 1613</p>
    </div>
  </div>
);

export const InMetaStrip = () => (
  <div className="max-w-xl">
    <Rule weight="ink" />
    <div className="flex justify-between py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
      <span>II AKa 145/22</span>
      <span>SA Kraków</span>
      <span>12 Oct 2022</span>
    </div>
    <Rule weight="hairline" />
    <div className="flex justify-between py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
      <span>[2016] EWCA Crim 1613</span>
      <span>CA (Crim Div)</span>
      <span>31 Oct 2016</span>
    </div>
    <Rule weight="medium" />
  </div>
);
