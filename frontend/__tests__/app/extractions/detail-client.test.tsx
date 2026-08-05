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
const pendingJob: ExtractionJobSnapshot = {
  job_id: JOB_ID,
  status: "PENDING",
  results: [],
};

describe("ExtractionJobClient", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the verified snapshot without an immediate duplicate fetch", () => {
    render(<ExtractionJobClient jobId={JOB_ID} initialJob={pendingJob} />);

    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
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

  it("does not poll terminal jobs", () => {
    render(
      <ExtractionJobClient
        jobId={JOB_ID}
        initialJob={{ ...pendingJob, status: "SUCCESS" }}
      />
    );

    act(() => jest.advanceTimersByTime(10_000));
    expect(global.fetch).not.toHaveBeenCalled();
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
});
