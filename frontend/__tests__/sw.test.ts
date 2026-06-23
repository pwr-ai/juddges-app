/**
 * Service worker behavior tests (issue #210).
 *
 * The SW file is not a module — it uses `self`/`addEventListener` globals.
 * We load its source as text and run it in a Node `vm` sandbox with mocked
 * worker globals, then drive it by invoking the captured event handlers.
 *
 * @jest-environment node
 */

import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

// A minimal Request shape — we can't use the real Request constructor for
// `mode: 'navigate'` because the Fetch spec forbids setting that mode
// explicitly via the constructor. The SW only reads `request.url`,
// `request.method`, `request.mode`, and `request.headers.get('cookie')`.
type RequestLike = {
  url: string;
  method: string;
  mode: string;
  headers: { get: (name: string) => string | null };
};

type FetchEvent = {
  request: RequestLike;
  respondWith: jest.Mock;
  waitUntil: jest.Mock;
};

type MessageEvent = {
  data: { type: string };
  waitUntil: jest.Mock;
};

interface SwSandbox {
  install: (event: { waitUntil: jest.Mock }) => void;
  activate: (event: { waitUntil: jest.Mock }) => void;
  fetch: (event: FetchEvent) => void;
  message: (event: MessageEvent) => void;
  caches: MockCaches;
  staticCacheName: string;
}

class MockCache {
  store = new Map<string, Response>();
  put = jest.fn(async (request: RequestLike | string, response: Response) => {
    this.store.set(typeof request === "string" ? request : request.url, response);
  });
  match = jest.fn(async (request: RequestLike | string) => {
    const key = typeof request === "string" ? request : request.url;
    return this.store.get(key);
  });
}

class MockCaches {
  caches = new Map<string, MockCache>();
  open = jest.fn(async (name: string) => {
    if (!this.caches.has(name)) this.caches.set(name, new MockCache());
    return this.caches.get(name)!;
  });
  match = jest.fn(async (request: RequestLike | string) => {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  });
  keys = jest.fn(async () => Array.from(this.caches.keys()));
  delete = jest.fn(async (name: string) => this.caches.delete(name));
}

function loadServiceWorker(): SwSandbox {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "public", "sw.js"),
    "utf8"
  );

  const handlers: Record<string, (event: unknown) => void> = {};

  const self = {
    addEventListener: jest.fn((eventName: string, handler: (event: unknown) => void) => {
      handlers[eventName] = handler;
    }),
    skipWaiting: jest.fn(),
    clients: { claim: jest.fn().mockResolvedValue(undefined) },
    location: { origin: "https://example.test" },
  };

  const caches = new MockCaches();

  const context = vm.createContext({
    self,
    caches,
    fetch: globalThis.fetch,
    URL: globalThis.URL,
    Response: globalThis.Response,
    // AbortController/Signal are SW globals in real browsers; the vm sandbox
    // needs them wired in explicitly for the navigation/API timeout (issue #178).
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    DOMException: globalThis.DOMException,
    Promise,
    setTimeout,
    clearTimeout,
    console,
  });

  vm.runInContext(src, context);

  // Pull CACHE_VERSION-derived names back out so tests can assert on cache state
  const staticCacheName = vm.runInContext("STATIC_CACHE", context) as string;

  return {
    install: (event) => handlers.install?.(event),
    activate: (event) => handlers.activate?.(event),
    fetch: (event) => handlers.fetch?.(event),
    message: (event) => handlers.message?.(event),
    caches,
    staticCacheName,
  };
}

function makeFetchEvent(
  url: string,
  init?: { mode?: string; method?: string; cookie?: string }
): FetchEvent {
  return {
    request: {
      url,
      method: init?.method ?? "GET",
      mode: init?.mode ?? "cors",
      headers: { get: (name: string) => (name.toLowerCase() === "cookie" ? init?.cookie ?? null : null) },
    },
    respondWith: jest.fn(),
    waitUntil: jest.fn(),
  };
}

describe("service worker (sw.js)", () => {
  let sw: SwSandbox;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(
      new Response("ok", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    sw = loadServiceWorker();
  });

  describe("/api/* requests (issue #210)", () => {
    it("does not write /api/* responses to any cache", async () => {
      const event = makeFetchEvent("https://example.test/api/collections");
      sw.fetch(event);

      expect(event.respondWith).toHaveBeenCalledTimes(1);
      await event.respondWith.mock.calls[0][0];

      // No cache should have been opened for writing
      for (const cache of sw.caches.caches.values()) {
        expect(cache.put).not.toHaveBeenCalled();
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not read /api/* responses from any cache", async () => {
      // Pre-populate every cache to verify reads are skipped
      const staleResponse = new Response("LEAKED", { status: 200 });
      const cache = await sw.caches.open(sw.staticCacheName);
      await cache.put(new Request("https://example.test/api/collections"), staleResponse);
      cache.match.mockClear();

      const event = makeFetchEvent("https://example.test/api/collections");
      sw.fetch(event);

      await event.respondWith.mock.calls[0][0];

      // /api/* must go to network, not cache lookup
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cache.match).not.toHaveBeenCalled();
    });

    it("falls back to an offline JSON response when network fails", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const event = makeFetchEvent("https://example.test/api/collections");
      sw.fetch(event);

      const response = (await event.respondWith.mock.calls[0][0]) as Response;
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("offline");
    });

    it("does not cache /api/* even when an authenticated cookie is absent", async () => {
      const event = makeFetchEvent("https://example.test/api/judgments");
      sw.fetch(event);
      await event.respondWith.mock.calls[0][0];

      for (const cache of sw.caches.caches.values()) {
        expect(cache.put).not.toHaveBeenCalled();
      }
    });
  });

  describe("navigation requests (issue #210)", () => {
    it("does not write navigation HTML to any cache", async () => {
      const event = makeFetchEvent("https://example.test/dashboard", { mode: "navigate" });
      sw.fetch(event);

      await event.respondWith.mock.calls[0][0];

      for (const cache of sw.caches.caches.values()) {
        expect(cache.put).not.toHaveBeenCalled();
      }
    });

    it("returns the offline shell when navigation fails", async () => {
      fetchMock.mockRejectedValueOnce(new Error("offline"));

      const event = makeFetchEvent("https://example.test/dashboard", { mode: "navigate" });
      sw.fetch(event);

      const response = (await event.respondWith.mock.calls[0][0]) as Response;
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toContain("Offline");
    });

    it("passes an AbortController signal so stalled navigations time out (issue #178)", async () => {
      const event = makeFetchEvent("https://example.test/dashboard", { mode: "navigate" });
      sw.fetch(event);
      await event.respondWith.mock.calls[0][0];

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0][1];
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("falls through to the offline shell when the fetch is aborted by timeout", async () => {
      jest.useFakeTimers();
      try {
        // Reload the SW inside fake-timer scope so its captured setTimeout is faked.
        const fakeSw = loadServiceWorker();
        fetchMock.mockImplementationOnce((_req, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          });
        });

        const event = makeFetchEvent("https://example.test/dashboard", { mode: "navigate" });
        fakeSw.fetch(event);

        jest.advanceTimersByTime(3000);

        const response = (await event.respondWith.mock.calls[0][0]) as Response;
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).toContain("Offline");
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("static assets", () => {
    it("caches hashed Next.js assets in STATIC_CACHE", async () => {
      const event = makeFetchEvent("https://example.test/_next/static/chunks/main.abc123.js");
      sw.fetch(event);

      await event.respondWith.mock.calls[0][0];

      const cache = sw.caches.caches.get(sw.staticCacheName);
      expect(cache?.put).toHaveBeenCalledTimes(1);
    });
  });

  describe("RSC payloads", () => {
    it("does not intercept ?_rsc requests at all", () => {
      const event = makeFetchEvent("https://example.test/dashboard?_rsc=abc", { mode: "navigate" });
      sw.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    });
  });

  describe("auth-related paths", () => {
    it("does not intercept /auth/* requests", () => {
      const event = makeFetchEvent("https://example.test/auth/login");
      sw.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    });

    it("does not intercept callback URLs", () => {
      const event = makeFetchEvent("https://example.test/api/auth/callback");
      sw.fetch(event);
      expect(event.respondWith).not.toHaveBeenCalled();
    });
  });

  describe("CLEAR_CACHES message", () => {
    it("deletes every non-static cache", async () => {
      // Seed both a static and a stray dynamic cache
      await sw.caches.open(sw.staticCacheName);
      await sw.caches.open("dynamic-v3");
      await sw.caches.open("dynamic-v2");

      const event: MessageEvent = {
        data: { type: "CLEAR_CACHES" },
        waitUntil: jest.fn((p: Promise<unknown>) => p),
      };
      sw.message(event);

      expect(event.waitUntil).toHaveBeenCalledTimes(1);
      await event.waitUntil.mock.calls[0][0];

      expect(sw.caches.caches.has("dynamic-v3")).toBe(false);
      expect(sw.caches.caches.has("dynamic-v2")).toBe(false);
      expect(sw.caches.caches.has(sw.staticCacheName)).toBe(true);
    });
  });

  describe("activate", () => {
    it("evicts prior-version dynamic caches", async () => {
      await sw.caches.open(sw.staticCacheName);
      await sw.caches.open("dynamic-v3");
      await sw.caches.open("static-v3");

      const event = { waitUntil: jest.fn((p: Promise<unknown>) => p) };
      sw.activate(event);

      await event.waitUntil.mock.calls[0][0];

      expect(sw.caches.caches.has("dynamic-v3")).toBe(false);
      expect(sw.caches.caches.has("static-v3")).toBe(false);
      expect(sw.caches.caches.has(sw.staticCacheName)).toBe(true);
    });
  });
});
