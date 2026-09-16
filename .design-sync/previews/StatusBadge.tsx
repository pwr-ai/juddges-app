import * as React from "react";
import { StatusBadge } from "@juddges/design-system";

export const Default = () => <StatusBadge status="completed" />;

export const Tones = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge status="completed" />
    <StatusBadge status="pending" />
    <StatusBadge status="failed" />
    <StatusBadge status="in_progress" />
    <StatusBadge status="archived" />
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge status="processing" size="sm" />
    <StatusBadge status="processing" size="md" />
    <StatusBadge status="processing" size="lg" />
  </div>
);

export const DotOnlyAndLabel = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge status="running" showText={false} />
    <StatusBadge status="running" label="Extracting…" />
    <StatusBadge status="custom" tone="oxblood" label="Needs review" />
    <StatusBadge status="verified" showDot={false} />
  </div>
);

export const ExtractionTable = () => (
  <table className="w-full max-w-md text-sm">
    <tbody className="divide-y divide-[color:var(--rule)]">
      {[
        ["II AKa 412/22", "completed"],
        ["I ACa 88/23", "processing"],
        ["III K 15/24", "failed"],
        ["IV Ka 301/23", "queued"],
      ].map(([sig, status]) => (
        <tr key={sig}>
          <td className="py-2 font-mono text-[color:var(--ink)]">{sig}</td>
          <td className="py-2 text-right"><StatusBadge status={status} size="sm" /></td>
        </tr>
      ))}
    </tbody>
  </table>
);
