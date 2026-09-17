import * as React from "react";
import { Stat } from "@juddges/design-system";

/**
 * Stat's outer framer-motion wrapper starts at opacity 0 and only animates
 * in via whileInView. The capture harness pins the clock, so the tween never
 * runs — force the settled state for the static screenshot.
 */
const Settled = ({ children }: { children: React.ReactNode }) => (
  <div className="ds-stat-settled">
    <style>{`.ds-stat-settled [style*="opacity"]{opacity:1!important;transform:none!important}`}</style>
    {children}
  </div>
);

export const Default = () => (
  <Settled>
    <Stat static value={47000} suffix="+" label="Polish judgments" detail="Common courts, 2012–2024" />
  </Settled>
);

export const Sizes = () => (
  <Settled>
    <div className="flex flex-wrap items-end gap-12">
      <Stat static size="sm" value={850} label="Small — 850" />
      <Stat static size="md" value={47000} suffix="+" label="Medium — 47K+" />
      <Stat static size="lg" value={1234567} label="Large — 1.2M" />
    </div>
  </Settled>
);

export const WithMarker = () => (
  <Settled>
    <div className="flex flex-wrap gap-12">
      <Stat static value={412} marker="¹" label="Judges named (UK)" detail="Court of Appeal, Criminal Division" />
      <Stat static value={87} suffix="%" marker="²" label="Extraction accuracy" detail="Against hand-annotated sample" />
    </div>
  </Settled>
);

export const StringValue = () => (
  <Settled>
    <div className="flex flex-wrap gap-12">
      <Stat static value="2012–2024" label="Coverage" detail="Strings render verbatim, no tween" />
      <Stat static value="3M" suffix="+" label="Tokens indexed" />
    </div>
  </Settled>
);

export const Loading = () => (
  <Settled>
    <div className="flex flex-wrap gap-12">
      <Stat static loading value={0} label="Judgments" />
      <Stat static loading value={0} label="Courts" detail="Loading from Supabase…" />
    </div>
  </Settled>
);
