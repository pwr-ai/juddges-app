/// <reference lib="webworker" />

const CACHE_VERSION = "v2";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

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

// Activate: clean old caches and claim clients
self.addEventListener("activate", (event) => {
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE];
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

// Helper: check if a request is for a static asset
function isStaticAsset(url) {
  return CACHEABLE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

// Helper: check if request is a Next.js data/RSC request
function isNextDataRequest(url) {
  return (
    url.pathname.startsWith("/_next/") || url.searchParams.has("_rsc")
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

  // Static assets: Cache-First
  if (isStaticAsset(url) || isNextDataRequest(url)) {
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

  // Other API requests: Network-First with fallback
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || createOfflineApiResponse())
        )
    );
    return;
  }

  // Page navigations: Network-First with offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || createOfflinePageResponse())
        )
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
});
