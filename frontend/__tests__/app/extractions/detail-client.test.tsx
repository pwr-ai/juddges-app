import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ExtractionJobClient } from "@/app/extractions/[id]/_components/ExtractionJobClient";
import type { ExtractionJobSnapshot } from "@/lib/extractions/detail-contract";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), child: jest.fn(() => ({ error: jest.fn() })) },
  logger: { error: jest.fn(), child: jest.fn(() => ({ error: jest.fn() })) },
}));

const JOB_ID = "22222222-3333-4444-8555-666666666666";
const pendingJob: ExtractionJobSnapshot = {
  job_id: JOB_ID,
  status: "PENDING",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function completedResult(value: string, documentId = "document-1") {
  return {
    collection_id: "collection-1",
    document_id: documentId,
    status: "completed",
    created_at: "2026-08-06T00:00:00Z",
    updated_at: "2026-08-06T00:01:00Z",
    extracted_data: { value },
  };
}

function failedResult(documentId: string, message: string) {
  return {
    collection_id: "collection-1",
    document_id: documentId,
    status: "failed",
    created_at: "2026-08-06T00:00:00Z",
    updated_at: "2026-08-06T00:01:00Z",
    error_message: message,
    extracted_data: null,
  };
}

function resultsPage(
  results: unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      job_id: JOB_ID,
      offset: 0,
      limit: 20,
      total: results.length,
      filtered_total: results.length,
      counts: { completed: results.length, failed: 0, other: 0 },
      results,
      ...overrides,
    }),
  };
}

type FetchResponse = Record<string, unknown> | Promise<Response>;

/**
 * Route by URL. The detail page issues status polls and results-page requests;
 * each kind gets its own handler so a test controls them independently.
 */
function routeFetch(handlers: {
  poll: (call: number) => FetchResponse;
  results?: (url: URL, call: number) => FetchResponse;
}) {
  let pollCall = 0;
  let resultsCall = 0;
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
    const parsed = new URL(String(url), "http://localhost");
    if (parsed.pathname.endsWith("/results")) {
      return (handlers.results ?? (() => resultsPage([])))(parsed, resultsCall++);
    }
    return handlers.poll(pollCall++);
  });
}

function pollCalls() {
  return (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) => !String(url).includes("/results")
  );
}

function resultsCalls(): URL[] {
  return (global.fetch as jest.Mock).mock.calls
    .map(([url]) => new URL(String(url), "http://localhost"))
    .filter((url) => url.pathname.endsWith("/results"));
}

const status = (value: string, extra: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ job_id: JOB_ID, status: value, results: [], ...extra }),
});

describe("ExtractionJobClient", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the minimal verified snapshot and polls the status once", async () => {
    routeFetch({ poll: () => status("PENDING") });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    expect(screen.getByText("PENDING")).toBeInTheDocument();
    await waitFor(() => expect(pollCalls()).toHaveLength(1));
  });

  it("fetches page 1 from the results route and never asks for the whole job", async () => {
    routeFetch({
      poll: () => status("SUCCESS"),
      results: () => resultsPage([completedResult("v1")]),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );

    await waitFor(() => expect(resultsCalls().length).toBeGreaterThan(0));
    const first = resultsCalls()[0];
    expect(first.pathname).toBe(`/api/extractions/${JOB_ID}/results`);
    expect(first.searchParams.get("offset")).toBe("0");
    expect(first.searchParams.get("limit")).toBe("20");
    expect(first.searchParams.get("status")).toBe("completed");
    // The poll is the status-only endpoint; no request ever carries the full job.
    for (const [url] of pollCalls()) {
      expect(String(url)).toBe(`/api/extractions?job_id=${JOB_ID}`);
    }
    expect(await screen.findByRole("cell", { name: "v1" })).toBeVisible();
  });

  it("requests the next offset when the page changes", async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      completedResult(`v${i}`, `document-${i}`)
    );
    routeFetch({
      poll: () => status("SUCCESS"),
      results: (url) =>
        resultsPage(
          url.searchParams.get("offset") === "0"
            ? rows
            : [completedResult("page-two", "document-21")],
          {
            total: 21,
            filtered_total: 21,
            counts: { completed: 21, failed: 0, other: 0 },
          }
        ),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );
    await screen.findByRole("cell", { name: "v0" });

    fireEvent.click(screen.getByTitle("Next page"));

    expect(await screen.findByRole("cell", { name: "page-two" })).toBeVisible();
    const last = resultsCalls().at(-1)!;
    expect(last.searchParams.get("offset")).toBe("20");
    expect(last.searchParams.get("limit")).toBe("20");
    expect(last.searchParams.get("status")).toBe("completed");
  });

  it("restarts at the first page with the new limit when the page size changes", async () => {
    routeFetch({
      poll: () => status("SUCCESS"),
      results: () =>
        resultsPage([completedResult("v1")], {
          total: 100,
          filtered_total: 100,
          counts: { completed: 100, failed: 0, other: 0 },
        }),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );
    await screen.findByRole("cell", { name: "v1" });

    fireEvent.change(screen.getByDisplayValue("20"), { target: { value: "50" } });

    await waitFor(() => {
      const last = resultsCalls().at(-1)!;
      expect(last.searchParams.get("limit")).toBe("50");
      expect(last.searchParams.get("offset")).toBe("0");
    });
  });

  it("asks for status=failed on the Failed tab and lists the page's failures", async () => {
    routeFetch({
      poll: () => status("SUCCESS"),
      results: (url) =>
        url.searchParams.get("status") === "failed"
          ? resultsPage([failedResult("document-9", "model refused")], {
              total: 3,
              filtered_total: 1,
              counts: { completed: 2, failed: 1, other: 0 },
            })
          : resultsPage([completedResult("v1")], {
              total: 3,
              filtered_total: 2,
              counts: { completed: 2, failed: 1, other: 0 },
            }),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );
    await screen.findByRole("cell", { name: "v1" });

    // Counts come from the job-wide `counts`, not from the rows on screen.
    const failedTab = await screen.findByRole("tab", { name: /Failed \(1\)/ });
    expect(screen.getByRole("tab", { name: /Completed \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();

    fireEvent.mouseDown(failedTab);
    fireEvent.click(failedTab);

    expect(await screen.findByText("model refused")).toBeVisible();
    const last = resultsCalls().at(-1)!;
    expect(last.searchParams.get("status")).toBe("failed");
    expect(last.searchParams.get("offset")).toBe("0");
  });

  it("points the export at the server-side export route, not at the visible page", async () => {
    routeFetch({
      poll: () => status("SUCCESS"),
      results: () => resultsPage([completedResult("v1")]),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );
    await screen.findByRole("cell", { name: "v1" });

    expect(screen.getByRole("link", { name: /Excel/ })).toHaveAttribute(
      "href",
      `/api/extractions/${JOB_ID}/export?format=xlsx`
    );
    expect(screen.getByRole("link", { name: /CSV/ })).toHaveAttribute(
      "href",
      `/api/extractions/${JOB_ID}/export?format=csv`
    );
  });

  it("keeps verified data visible and labels a polling backend failure", async () => {
    routeFetch({
      poll: () => ({
        ok: false,
        status: 503,
        json: async () => ({ message: "Worker unavailable" }),
      }),
    });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Extraction service error (503)"
      );
    });
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.queryByText("Job Not Found")).not.toBeInTheDocument();
  });

  it("polls a terminal job once without scheduling another poll", async () => {
    routeFetch({ poll: () => status("SUCCESS") });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );

    await waitFor(() => expect(pollCalls()).toHaveLength(1));
    act(() => jest.advanceTimersByTime(10_000));
    expect(pollCalls()).toHaveLength(1);
  });

  it("stops polling when a live job reaches a terminal status", async () => {
    routeFetch({ poll: () => status("SUCCESS") });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(pollCalls()).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(9_000);
    });
    expect(pollCalls()).toHaveLength(1);
  });

  it("refetches the visible page when the job's completed count grows", async () => {
    // The page content follows the job: it holds "old" until the second poll
    // reports more finished documents, then "new".
    let grown = false;
    routeFetch({
      poll: (call) => {
        grown = call >= 1;
        return status("IN_PROGRESS", {
          completed_documents: call === 0 ? 1 : 2,
          total_documents: 5,
        });
      },
      results: () =>
        resultsPage(grown ? [completedResult("new")] : [completedResult("old")]),
    });

    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);
    await screen.findByRole("cell", { name: "old" });
    const before = resultsCalls().length;

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    expect(await screen.findByRole("cell", { name: "new" })).toBeVisible();
    expect(screen.queryByRole("cell", { name: "old" })).not.toBeInTheDocument();
    expect(resultsCalls().length).toBeGreaterThan(before);
  });

  it("derives the selected document from the current page", async () => {
    routeFetch({
      poll: () => status("SUCCESS"),
      results: () => resultsPage([completedResult("picked")]),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );
    await screen.findByRole("cell", { name: "picked" });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Document" }));
    fireEvent.click(screen.getByRole("tab", { name: "Document" }));

    expect(await screen.findByText("picked")).toBeVisible();
  });

  it("shows an error with a retry when the results page cannot be loaded", async () => {
    let attempts = 0;
    routeFetch({
      poll: () => status("SUCCESS"),
      results: () =>
        attempts++ === 0
          ? {
              ok: false,
              status: 503,
              json: async () => ({ message: "store unavailable" }),
            }
          : resultsPage([completedResult("recovered")]),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );

    expect(await screen.findByText("Could not load results (503)")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("cell", { name: "recovered" })).toBeVisible();
  });

  it("never overlaps status requests while the previous poll is pending", async () => {
    const first = deferred<Response>();
    routeFetch({ poll: () => first.promise });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(pollCalls()).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(pollCalls()).toHaveLength(1);

    await act(async () => {
      first.resolve({
        ok: true,
        status: 200,
        json: async () => ({ job_id: JOB_ID, status: "PENDING", results: [] }),
      } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(pollCalls()).toHaveLength(2);
  });

  it("aborts an in-flight poll when the detail page unmounts", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation(
      (url: string, init?: RequestInit) => {
        if (String(url).includes("/results")) return Promise.resolve(resultsPage([]));
        signal = init?.signal ?? undefined;
        return pending.promise;
      }
    );
    const view = render(
      <ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />
    );
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("times out one stuck poll as 504 without starting another request", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (url: string, init?: RequestInit) => {
        if (String(url).includes("/results")) return Promise.resolve(resultsPage([]));
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
    );
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      jest.advanceTimersByTime(10_000);
    });

    expect(pollCalls()).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Extraction service error (504)"
    );
  });
});
