/**
 * Sentry client-side initialization for Next.js 15 App Router.
 *
 * This file is loaded in the browser. It is a no-op when NEXT_PUBLIC_SENTRY_DSN
 * is not set, so development and test environments are unaffected.
 *
 * Install: npm install @sentry/nextjs
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.NEXT_PUBLIC_GIT_SHA ?? undefined,

    // Keep trace sampling low to avoid budget blow-up.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

    // Capture 100% of errors (only traces are sampled).
    sampleRate: 1.0,

    // Tag every event with service=frontend for easy filtering.
    beforeSend(event) {
      event.tags = { ...event.tags, service: "frontend" };
      return event;
    },
  });
}
