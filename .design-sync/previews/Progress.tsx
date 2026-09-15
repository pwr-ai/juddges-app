import * as React from "react";
import { Progress } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-sm">
    <Progress value={62} />
  </div>
);

export const Values = () => (
  <div className="grid max-w-sm gap-4">
    <Progress value={0} />
    <Progress value={25} />
    <Progress value={62} />
    <Progress value={100} />
  </div>
);

export const WithLabel = () => (
  <div className="grid max-w-sm gap-2">
    <div className="flex items-center justify-between text-sm">
      <span className="text-[color:var(--ink)]">Extracting 1,972 judgments</span>
      <span className="font-mono tabular-nums text-[color:var(--ink-soft)]">1,223 / 1,972</span>
    </div>
    <Progress value={62} aria-label="Extraction progress" />
    <p className="text-xs text-[color:var(--ink-soft)]">Sąd Apelacyjny w Warszawie · batch 4 of 6</p>
  </div>
);

export const Thick = () => (
  <div className="max-w-sm">
    <Progress value={80} className="h-3" />
  </div>
);
