import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import { downloadCompareCsv, useCompare, useComparePair } from "@/lib/compare/api";
import type { CompareRequest } from "@/lib/compare/types";

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const REQUEST: CompareRequest = { filters: {}, text_query: null };

describe("downloadCompareCsv", () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let appendSpy: jest.SpyInstance;
  let removeSpy: jest.SpyInstance;
  let clickSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    createObjectURL = jest.fn(() => "blob:mock-url");
    revokeObjectURL = jest.fn();
    // jsdom doesn't implement these; the module calls them directly on URL.
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    appendSpy = jest.spyOn(document.body, "appendChild");
    removeSpy = jest.spyOn(document.body, "removeChild");
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fakeBlob = { size: 7, type: "text/csv" } as unknown as Blob;
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-disposition": 'attachment; filename="compare.csv"' }),
      blob: () => Promise.resolve(fakeBlob),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("appends the anchor, clicks it, then revokes the URL after a deferred remove", async () => {
    await downloadCompareCsv(REQUEST);

    // Anchor must be attached to the DOM before click() — Firefox (and some
    // other browsers) silently ignore a click on a detached <a download>.
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const appendOrder = appendSpy.mock.invocationCallOrder[0];
    const clickOrder = clickSpy.mock.invocationCallOrder[0];
    expect(appendOrder).toBeLessThan(clickOrder);

    // Revoking the object URL must not happen synchronously with click() —
    // some browsers (Firefox) need the URL to remain valid a tick longer to
    // start the download.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    jest.runAllTimers();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    const removeOrder = removeSpy.mock.invocationCallOrder[0];
    const revokeOrder = revokeObjectURL.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThanOrEqual(revokeOrder);
  });
});

describe("useCompare retry", () => {
  it("does not retry a 404", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    global.fetch = fetchMock;

    const { result } = renderHook(() => useCompare(REQUEST, true), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useComparePair retry", () => {
  it("does not retry a 404", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
    );
    global.fetch = fetchMock;

    const { result } = renderHook(() => useComparePair("missing-pair"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
