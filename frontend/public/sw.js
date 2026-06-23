/// <reference lib="webworker" />

// Bumped v3 -> v4. v3 still cached /api/* and navigation HTML responses
// keyed only by URL, which could replay one user's authenticated response
// to the next on the same browser after logout (issue #210). Activating
// v4 evicts those entries. Bump again whenever cache semantics change.
const CACHE_VERSION = "v4";
const STATIC_CACHE = `static-${CACHE_VERSION}`;

const STATIC_ASSETS = [];

const CACHEABLE_EXTENSIONS = [
  ".js",
  ".css",
  ".woff2",
  ".woff",
  ".ttf",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".ico",
];

// Install: pre-cache static assets when defined
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and claim clients. Anything not in currentCaches
// (notably any `dynamic-v*` entries from prior versions) gets evicted.
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !currentCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Navigation/API network timeout. On flaky networks the browser can hang for
// 5–10 s waiting for a navigation response before the connection finally errors,
// leaving the user staring at a blank tab (issue #178). We race the fetch against
// an AbortController so a stalled request fails fast and falls through to the
// offline shell instead. Kept short enough to feel responsive, long enough to
// tolerate normal latency.
const NETWORK_TIMEOUT_MS = 2500;

// Fetch with a hard timeout. Resolves like `fetch`; rejects (AbortError) once
// NETWORK_TIMEOUT_MS elapses so callers can fall through to their offline path.
// NOTE: this does NOT add cache fallback for navigations/API — those responses
// are deliberately never cached (cross-user replay risk, issue #210).
function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// Helper: check if a request is for a static asset
function isStaticAsset(url) {
  return CACHEABLE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

// Helper: check if request is an immutable Next.js asset (hashed chunks, optimized images).
// NOTE: RSC payloads (?_rsc=...) are NOT included here — they carry auth-gated content
// and are handled separately (skipped entirely) so middleware can re-evaluate every time.
function isNextStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image")
  );
}

// Helper: check if request is an API call
function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

// Fetch handler with appropriate caching strategies
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Skip auth-related requests
  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("/callback")
  ) {
    return;
  }

  // Never intercept RSC payloads: App Router prefetches for protected routes
  // would otherwise cache pre-login redirect responses and replay them after login.
  if (url.searchParams.has("_rsc")) {
    return;
  }

  // Static assets (hashed chunks, fonts, images): Cache-First. These are
  // immutable / content-addressed, so cross-user replay is safe.
  if (isStaticAsset(url) || isNextStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(event.request, clone);
              });
            }
            return response;
          })
      )
    );
    return;
  }

  // API requests: network-only. We do NOT cache /api/* — too easy to leak
  // one user's authenticated response to the next (issue #210). Offline
  // replay isn't a goal for this app (see commit 1d05d48), so caching
  // would only add risk for no benefit. Fall back to an offline JSON
  // response if the network is genuinely unavailable.
  if (isApiRequest(url)) {
    event.respondWith(
      fetchWithTimeout(event.request).catch(() => createOfflineApiResponse())
    );
    return;
  }

  // Page navigations: network-only for the same reason. Next.js may inline
  // RSC payloads or per-user UI state into navigation responses; caching
  // them by URL alone would cross users on a shared browser. We add a short
  // timeout (issue #178) so a stalled network surfaces the offline shell
  // quickly instead of hanging for 5–10 s.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(event.request).catch(() => createOfflinePageResponse())
    );
    return;
  }
});

// Create a JSON response for offline API calls
function createOfflineApiResponse() {
  return new Response(
    JSON.stringify({
      error: "offline",
      message: "You are currently offline. This content is not available.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function createOfflinePageResponse() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body><main style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;"><h1>Offline</h1><p>You are currently offline and this page is not available.</p></main></body></html>`,
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

// Listen for messages from the app
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  // Defensive: if a future change ever re-introduces dynamic caching, this
  // lets AuthContext.signOut() purge it without waiting for a SW bump.
  // Currently a no-op (no `dynamic-*` caches are written), but cheap to keep.
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
    );
    return;
  }
});
