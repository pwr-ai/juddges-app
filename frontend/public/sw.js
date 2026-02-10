/// <reference lib="webworker" />

const CACHE_VERSION = "v2";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const OFFLINE_DOC_CACHE = `offline-documents-${CACHE_VERSION}`;

const STATIC_ASSETS = ["/offline", "/offline/documents"];

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

// Install: pre-cache the offline fallback pages
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
  const currentCaches = [STATIC_CACHE, DYNAMIC_CACHE, OFFLINE_DOC_CACHE];
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

// Helper: check if request is for a document API (higher priority caching)
function isDocumentApiRequest(url) {
  return /^\/api\/documents\/[^/]+\/(metadata|html|similar)/.test(url.pathname);
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

  // Document API requests: Network-First with offline doc cache fallback
  if (isDocumentApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(OFFLINE_DOC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request, { cacheName: OFFLINE_DOC_CACHE })
            .then(
              (cached) =>
                cached ||
                caches
                  .match(event.request)
                  .then((dynamicCached) => dynamicCached || createOfflineApiResponse())
            )
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
            .then((cached) => cached || caches.match("/offline"))
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

// Listen for messages from the app
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === "CACHE_DOCUMENT") {
    const { url, data } = event.data;
    caches.open(OFFLINE_DOC_CACHE).then((cache) => {
      const response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put(url, response);
    });
  }

  if (event.data?.type === "CACHE_DOCUMENT_HTML") {
    const { url, html } = event.data;
    caches.open(OFFLINE_DOC_CACHE).then((cache) => {
      const response = new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
      cache.put(url, response);
    });
  }

  if (event.data?.type === "REMOVE_CACHED_DOCUMENT") {
    const { url } = event.data;
    caches.open(OFFLINE_DOC_CACHE).then((cache) => {
      cache.delete(url);
    });
  }

  if (event.data?.type === "GET_CACHED_DOCUMENTS") {
    caches.open(OFFLINE_DOC_CACHE).then((cache) => {
      cache.keys().then((keys) => {
        const urls = keys.map((req) => req.url);
        event.source?.postMessage({
          type: "CACHED_DOCUMENTS_LIST",
          urls,
        });
      });
    });
  }
});

// Background sync: process annotation queue when connectivity returns
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-annotations") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "TRIGGER_SYNC" });
        });
      })
    );
  }
});
