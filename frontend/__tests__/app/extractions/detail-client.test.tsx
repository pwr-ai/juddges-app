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

function completedResult(value: string) {
  return {
    collection_id: "collection-1",
    document_id: "document-1",
    status: "completed",
    created_at: "2026-08-06T00:00:00Z",
    updated_at: "2026-08-06T00:01:00Z",
    extracted_data: { value },
  };
}

describe("ExtractionJobClient", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads full results once after rendering the minimal verified snapshot", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: JOB_ID, status: "PENDING", results: [] }),
    });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    expect(screen.getByText("PENDING")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("keeps verified data visible and labels a polling backend failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: "Worker unavailable" }),
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

  it("loads terminal results once without scheduling another poll", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: JOB_ID, status: "SUCCESS", results: [] }),
    });
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    act(() => jest.advanceTimersByTime(10_000));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("stops polling when a live job reaches a terminal status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: JOB_ID, status: "SUCCESS", results: [] }),
    });
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(9_000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("derives the selected result from the latest poll response", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job_id: JOB_ID,
          status: "PENDING",
          results: [completedResult("old")],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job_id: JOB_ID,
          status: "PENDING",
          results: [completedResult("new")],
        }),
      });

    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Document" })).toBeVisible());
    fireEvent.click(screen.getByRole("tab", { name: "Document" }));
    await waitFor(() => expect(screen.getByText("old")).toBeVisible());

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    await waitFor(() => expect(screen.getByText("new")).toBeVisible());
    expect(screen.queryByText("old")).not.toBeInTheDocument();
  });

  it("never overlaps status requests while the previous poll is pending", async () => {
    const first = deferred<Response>();
    (global.fetch as jest.Mock).mockReturnValue(first.promise);
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

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
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts an in-flight poll when the detail page unmounts", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, init?: RequestInit) => {
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
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
      jest.advanceTimersByTime(10_000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Extraction service error (504)"
    );
  });
});
