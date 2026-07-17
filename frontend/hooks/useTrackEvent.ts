"use client";

import { useCallback, useEffect } from "react";

import { useLanguage } from "@/contexts/LanguageContext";
import {
  _setLocaleOverride,
  track,
  type ClientEventName,
  type EventProperties,
} from "@/lib/analytics/track";

/**
 * Component-level product-analytics tracking. Keeps the flush envelope's
 * locale in sync with the active UI language; otherwise a stable wrapper
 * around `track()` (which also works outside React, e.g. in lib/api modules).
 */
export function useTrackEvent(): (
  eventName: ClientEventName,
  properties?: EventProperties
) => void {
  const { locale } = useLanguage();

  useEffect(() => {
    _setLocaleOverride(locale);
  }, [locale]);

  return useCallback((eventName, properties) => track(eventName, properties), []);
}
