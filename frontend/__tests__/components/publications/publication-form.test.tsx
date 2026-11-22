import { render, screen, waitFor } from "@testing-library/react";
import { PublicationForm } from "@/components/publications/admin/publication-form";
import type { PublicationWithResources } from "@/types/publication";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/lib/api/publications", () => ({
  createPublication: jest.fn(),
  updatePublication: jest.fn(),
  linkSchema: jest.fn(),
  unlinkSchema: jest.fn(),
  linkCollection: jest.fn(),
  unlinkCollection: jest.fn(),
  linkExtractionJob: jest.fn(),
  unlinkExtractionJob: jest.fn(),
}));

const SCHEMA_ID = "7dd87bca-2223-457d-a401-7a792f03453c";
const COLLECTION_ID = "491734bd-6f48-4f6b-b329-912b7ae3a815";

const publication = {
  id: "pub-1",
  title: "T",
  authors: [{ name: "A" }],
  venue: "V",
  year: 2026,
  abstract: "x",
  type: "journal",
  status: "published",
  schemas: [{ schemaId: SCHEMA_ID }],
  collections: [{ collectionId: COLLECTION_ID }],
  extractionJobs: [{ jobId: "celery-job-123456", jobStatus: "SUCCESS" }],
} as unknown as PublicationWithResources;

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

describe("PublicationForm research resources", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((url: string) => {
      if (url === "/api/schemas") return jsonResponse([{ id: SCHEMA_ID, name: "Base Schema" }]);
      if (url === "/api/collections") return jsonResponse([{ id: COLLECTION_ID, name: "Tax Collection" }]);
      if (url === "/api/jobs")
        return jsonResponse({
          jobs: [{ id: "row-uuid", job_id: "celery-job-123456", status: "SUCCESS", schema_name: "Base Schema" }],
        });
      return jsonResponse({ error: "bad" }, false);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("lists jobs from /api/jobs, never the job-detail /api/extractions route", async () => {
    render(<PublicationForm publication={publication} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs"));
    expect(fetchMock.mock.calls.map((c) => c[0])).not.toContain("/api/extractions");
  });

  it("shows linked schema, collection and job by name instead of raw ids", async () => {
    render(<PublicationForm publication={publication} />);
    expect(await screen.findByText("Base Schema")).toBeInTheDocument();
    expect(await screen.findByText("Tax Collection")).toBeInTheDocument();
    expect(await screen.findByText("Base Schema (celery-j…)")).toBeInTheDocument();
    expect(screen.queryByText(SCHEMA_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(COLLECTION_ID)).not.toBeInTheDocument();
  });

  it("falls back to a shortened id when name lookup fails", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ error: "down" }, false));
    render(<PublicationForm publication={publication} />);
    expect(await screen.findByText("7dd87bca…")).toBeInTheDocument();
    expect(screen.getByText("491734bd…")).toBeInTheDocument();
    expect(screen.getByText("celery-j…")).toBeInTheDocument();
  });
});
