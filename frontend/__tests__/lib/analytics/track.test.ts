/**
 * Unit tests for the product-analytics track() wrapper.
 *
 * Covers batching, PII stripping, never-throw guarantees, guest/session id
 * persistence, and the sendBeacon-first transport.
 */

import {
  _resetForTests,
  _setLocaleOverride,
  flush,
  track,
} from "@/lib/analytics/track";

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

function lastSentBody(): {
  events: { event_name: string; properties: Record<string, unknown> }[];
  session_id: string;
  guest_session_id: string;
  surface: string;
  locale: string | null;
  app_version: string | null;
} {
  const calls = mockFetch.mock.calls;
  const [, init] = calls[calls.length - 1];
  return JSON.parse(init?.body as string);
}

describe("track()", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    _resetForTests();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true } as Response);
    global.fetch = mockFetch;
    // Force the fetch fallback path by default; sendBeacon covered explicitly.
    Object.defineProperty(navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("batches events: two track() calls produce a single POST after the flush window", () => {
    track("judgment_viewed", { document_id: "d1" });
    track("search_result_clicked", { document_id: "d1", position: 2 });

    expect(mockFetch).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/events");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    const body = lastSentBody();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].event_name).toBe("judgment_viewed");
    expect(body.surface).toBe("web");
  });

  it("flushes immediately when the batch reaches the max size", () => {
    for (let i = 0; i < 20; i++) {
      track("judgment_viewed", { document_id: `d${i}` });
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(lastSentBody().events).toHaveLength(20);
  });

  it("strips PII property keys before sending", () => {
    track("search_submitted", {
      email: "user@example.com",
      password: "hunter2",
      token: "abc",
      query: "secret search text",
      nested: { email: "nested@example.com", ok_nested: true },
      ok: 1,
    });
    flush();

    const sent = lastSentBody().events[0].properties;
    expect(sent).toEqual({ nested: { ok_nested: true }, ok: 1 });
  });

  it("never throws when fetch rejects", () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    expect(() => {
      track("judgment_viewed", { document_id: "d1" });
      flush();
    }).not.toThrow();
  });

  it("never throws when storage is unavailable", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      expect(() => {
        track("judgment_viewed", { document_id: "d1" });
        flush();
      }).not.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("persists guest and session ids across flushes", () => {
    track("judgment_viewed", { document_id: "d1" });
    flush();
    track("judgment_viewed", { document_id: "d2" });
    flush();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    const second = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(first.guest_session_id).toBe(second.guest_session_id);
    expect(first.session_id).toBe(second.session_id);
    expect(window.localStorage.getItem("juddges-guest-id")).toBe(
      first.guest_session_id
    );
  });

  it("prefers sendBeacon when available and skips fetch", () => {
    const sendBeacon = jest.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });

    track("judgment_viewed", { document_id: "d1" });
    flush();

    expect(sendBeacon).toHaveBeenCalledWith("/api/events", expect.any(Blob));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch when sendBeacon refuses the payload", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: jest.fn(() => false),
      configurable: true,
      writable: true,
    });

    track("judgment_viewed", { document_id: "d1" });
    flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("includes the locale override in the envelope", () => {
    _setLocaleOverride("pl");
    track("judgment_viewed", { document_id: "d1" });
    flush();

    expect(lastSentBody().locale).toBe("pl");
  });

  it("does not send an empty flush", () => {
    flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
