import { act, render, screen, waitFor } from "@testing-library/react";

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

function jobSnapshot(
  overrides: Partial<ExtractionJobSnapshot>
): ExtractionJobSnapshot {
  return {
    job_id: JOB_ID,
    status: "IN_PROGRESS",
    ...overrides,
  };
}

function pollResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ job_id: JOB_ID, results: [], ...body }),
  };
}

describe("ExtractionJobClient resume notice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tells the user the job resumed and how much was already done", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      pollResponse({
        status: "IN_PROGRESS",
        attempts: 2,
        progress: { completed: 300, total: 500 },
      })
    );

    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={jobSnapshot({
          attempts: 2,
          progress: { completed: 300, total: 500 },
        })}
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/resumed/i);
    expect(notice).toHaveTextContent("300");
    expect(notice).toHaveTextContent("500");
  });

  it("shows no resume notice on a first attempt", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      pollResponse({
        status: "IN_PROGRESS",
        attempts: 1,
        progress: { completed: 12, total: 500 },
      })
    );

    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={jobSnapshot({
          attempts: 1,
          progress: { completed: 12, total: 500 },
        })}
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/resumed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the notice when a later poll omits the attempt counters", async () => {
    // The load-bearing case. A poll response that does not carry `attempts`
    // spreads `attempts: undefined` over the value the page already holds, so
    // without a monotonic merge the notice renders once and then disappears on
    // the first three-second poll — visible in production, invisible to a test
    // that only renders.
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        pollResponse({
          status: "IN_PROGRESS",
          attempts: 2,
          progress: { completed: 300, total: 500 },
        })
      )
      .mockResolvedValueOnce(pollResponse({ status: "IN_PROGRESS" }));

    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={jobSnapshot({
          attempts: 2,
          progress: { completed: 300, total: 500 },
        })}
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(/resumed/i);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/resumed/i);
    expect(notice).toHaveTextContent("300");
    expect(notice).toHaveTextContent("500");
  });
});
