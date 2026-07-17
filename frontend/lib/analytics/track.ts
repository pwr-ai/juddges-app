/**
 * Product-analytics event tracking (`app_events` table).
 *
 * Thin fire-and-forget wrapper: `track(eventName, properties?)` queues events
 * and flushes them in batches to the Next.js `/api/events` proxy, which
 * forwards to the FastAPI backend with the server-side API key.
 *
 * Distinct from `@/lib/analytics` (GA/FB `trackEvent`) — this module feeds our
 * own first-party event stream. See docs/explanation/event-taxonomy.md.
 *
 * Guarantees:
 * - Never throws (analytics must never break the app).
 * - No PII: denylisted property keys are stripped before queueing.
 * - `auth_*` events are excluded at the type level — they are
 *   server-authoritative (DB triggers / server signout route).
 */

/** Client-emittable events. Kept in sync with backend EVENT_ALLOWLIST
 * (backend/app/services/app_events.py) minus the server-only auth_* set. */
export type ClientEventName =
  | "search_submitted"
  | "search_result_clicked"
  | "search_zero_results"
  | "judgment_viewed"
  | "judgment_copied_citation"
  | "judgment_exported"
  | "annotation_created"
  | "annotation_updated"
  | "annotation_deleted"
  | "chat_message_sent"
  | "chat_response_received"
  | "chat_feedback_thumbs_up"
  | "chat_feedback_thumbs_down"
  | "collection_created"
  | "collection_item_added"
  | "error_boundary_triggered";

export type EventProperties = Record<string, unknown>;

/** Device-scoped anonymous id (survives sign-in for funnel stitching). */
const GUEST_ID_KEY = "juddges-guest-id";
/** Tab-scoped session id. */
const SESSION_ID_KEY = "juddges-session-id";
/** Matches lib/i18n/config.ts LOCALE_STORAGE_KEY. */
const LOCALE_STORAGE_KEY = "preferred-locale";

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 20;

/**
 * Property keys never sent to the backend. Raw search text lives in
 * search_analytics — events carry derived fields like query_length instead.
 */
const PII_KEY_PATTERN = /^(email|password|token|secret|authorization|query)$/i;

interface QueuedEvent {
  event_name: ClientEventName;
  properties: EventProperties;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;
let localeOverride: string | null = null;

function stripPii(properties: EventProperties): EventProperties {
  const clean: EventProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_KEY_PATTERN.test(key)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[analytics] dropped PII property key "${key}"`);
      }
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // One level of nesting is enough for our flat property shapes.
      const nested: EventProperties = {};
      for (const [k, v] of Object.entries(value as EventProperties)) {
        if (PII_KEY_PATTERN.test(k)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[analytics] dropped PII property key "${key}.${k}"`);
          }
          continue;
        }
        nested[k] = v;
      }
      clean[key] = nested;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode / quota — id becomes per-flush ephemeral, which is fine.
  }
}

function mintId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `fallback-${Math.random().toString(36).slice(2)}`;
  }
}

function getOrMintGuestId(): string {
  const existing = safeStorageGet(window.localStorage, GUEST_ID_KEY);
  if (existing) return existing;
  const id = mintId();
  safeStorageSet(window.localStorage, GUEST_ID_KEY, id);
  return id;
}

function getOrMintSessionId(): string {
  const existing = safeStorageGet(window.sessionStorage, SESSION_ID_KEY);
  if (existing) return existing;
  const id = mintId();
  safeStorageSet(window.sessionStorage, SESSION_ID_KEY, id);
  return id;
}

function readStoredLocale(): string | null {
  return safeStorageGet(window.localStorage, LOCALE_STORAGE_KEY);
}

function installLifecycleListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  window.addEventListener("pagehide", () => flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Queue a product-analytics event. Batched (max 20 events / 5s window),
 * flushed early on page hide. Safe to call anywhere, including outside React
 * and during SSR (no-op).
 */
export function track(
  eventName: ClientEventName,
  properties?: EventProperties
): void {
  try {
    if (typeof window === "undefined") return;
    installLifecycleListeners();
    queue.push({ event_name: eventName, properties: stripPii(properties ?? {}) });
    if (queue.length >= MAX_BATCH) {
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
  } catch {
    // Analytics must never throw.
  }
}

/** Send all queued events now. Exposed for tests and page-hide flushing. */
export function flush(): void {
  try {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (queue.length === 0 || typeof window === "undefined") return;
    const events = queue.splice(0, MAX_BATCH);
    const body = JSON.stringify({
      events,
      session_id: getOrMintSessionId(),
      guest_session_id: getOrMintGuestId(),
      surface: "web",
      locale: localeOverride ?? readStoredLocale(),
      app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    });
    // sendBeacon survives page unload; fetch keepalive is the fallback.
    const beaconOk =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/events",
        new Blob([body], { type: "application/json" })
      );
    if (!beaconOk) {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
    if (queue.length > 0) {
      flushTimer = setTimeout(flush, 0);
    }
  } catch {
    // Analytics must never throw.
  }
}

/** Sync the active UI locale into the flush envelope (used by useTrackEvent). */
export function _setLocaleOverride(locale: string | null): void {
  localeOverride = locale;
}

/** Test-only: reset module state between test cases. */
export function _resetForTests(): void {
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  listenersInstalled = false;
  localeOverride = null;
}
