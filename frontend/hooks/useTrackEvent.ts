"use client";

import { useCallback } from "react";

import {
  track,
  type ClientEventName,
  type EventProperties,
} from "@/lib/analytics/track";

/**
 * Component-level product-analytics tracking: a stable wrapper around
 * `track()` (which also works outside React, e.g. in lib/api modules). The
 * flush envelope's locale is kept in sync by LanguageProvider via
 * `setTrackLocale`, so this hook needs no locale handling of its own.
 */
export function useTrackEvent(): (
  eventName: ClientEventName,
  properties?: EventProperties
) => void {
  return useCallback((eventName, properties) => track(eventName, properties), []);
}
