import * as React from "react";
import { Alert, AlertTitle, AlertDescription } from "@juddges/design-system";

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
  </svg>
);
const WarnIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />
  </svg>
);

export const Default = () => (
  <Alert>
    <InfoIcon />
    <AlertTitle>Extraction complete</AlertTitle>
    <AlertDescription>
      12 fields extracted from II AKa 47/23. Three fields fell below the 0.8 confidence threshold and are flagged for review.
    </AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert variant="destructive">
    <WarnIcon />
    <AlertTitle>Judgment text unavailable</AlertTitle>
    <AlertDescription>
      The full text of [2023] EWCA Crim 412 could not be fetched from the National Archives. Metadata is shown from the cached index.
    </AlertDescription>
  </Alert>
);

export const WithoutIcon = () => (
  <Alert>
    <AlertTitle>Anonymised judgment</AlertTitle>
    <AlertDescription>
      Party names in this Polish judgment were redacted by the publishing court before ingestion.
    </AlertDescription>
  </Alert>
);

export const TitleOnly = () => (
  <div className="flex flex-col gap-3">
    <Alert>
      <InfoIcon />
      <AlertTitle>Search index refreshed at 06:00 CET — 312 new judgments added.</AlertTitle>
    </Alert>
    <Alert variant="destructive">
      <WarnIcon />
      <AlertTitle>Rate limit reached — try again in 40 seconds.</AlertTitle>
    </Alert>
  </div>
);
