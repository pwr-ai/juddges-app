/**
 * @jest-environment node
 */

import {
  decodeExtractionSnapshot,
  encodeExtractionSnapshot,
  mergeExtractionJobUpdate,
  normalizeExtractionJobPayload,
  signExtractionSnapshot,
  verifyExtractionSnapshot,
  type ExtractionJobResponse,
} from "@/lib/extractions/detail-contract";

const JOB_ID = "22222222-3333-4444-8555-666666666666";
const ROUTE = `/extractions/${JOB_ID}`;

describe("extraction detail transport", () => {
  it("normalizes the backend task_id alias", () => {
    expect(
      normalizeExtractionJobPayload(
        { task_id: JOB_ID, status: "IN_PROGRESS", results: null },
        JOB_ID
      )
    ).toEqual(
      expect.objectContaining({ job_id: JOB_ID, status: "IN_PROGRESS", results: [] })
    );
  });

  it("rejects mismatched and malformed successful payloads", () => {
    expect(
      normalizeExtractionJobPayload(
        { job_id: "33333333-4444-4555-8666-777777777777", status: "SUCCESS" },
        JOB_ID
      )
    ).toBeNull();
    expect(normalizeExtractionJobPayload({ unexpected: true }, JOB_ID)).toBeNull();
  });

  it.each([
    [{ job_id: JOB_ID, status: "SUCCESS", results: [null] }],
    [{ job_id: JOB_ID, status: "SUCCESS", results: [{ document_id: "doc-1" }] }],
    [
      {
        job_id: JOB_ID,
        status: "SUCCESS",
        results: [
          {
            collection_id: "collection-1",
            document_id: "doc-1",
            status: "unknown",
            created_at: "2026-08-06T00:00:00Z",
            updated_at: "2026-08-06T00:00:00Z",
            extracted_data: {},
          },
        ],
      },
    ],
    [{ job_id: JOB_ID, status: "SUCCESS", results: [], progress: { completed: "1", total: 1 } }],
    [{ job_id: JOB_ID, status: "SUCCESS", results: [], progress: { completed: 2, total: 1 } }],
  ])("rejects invalid nested extraction payload %#", (payload) => {
    expect(normalizeExtractionJobPayload(payload, JOB_ID)).toBeNull();
  });

  it("accepts fully validated success and failed result elements", () => {
    expect(
      normalizeExtractionJobPayload(
        {
          job_id: JOB_ID,
          status: "PARTIALLY_COMPLETED",
          progress: { completed: 2, total: 2, percentage: 100 },
          results: [
            {
              collection_id: "collection-1",
              document_id: "doc-1",
              status: "completed",
              created_at: "2026-08-06T00:00:00Z",
              updated_at: "2026-08-06T00:01:00Z",
              extracted_data: { outcome: "allowed" },
            },
            {
              collection_id: "collection-1",
              document_id: "doc-2",
              status: "failed",
              created_at: "2026-08-06T00:00:00Z",
              updated_at: "2026-08-06T00:01:00Z",
              error_message: "OCR failed",
              extracted_data: null,
            },
          ],
        },
        JOB_ID
      )
    ).not.toBeNull();
  });

  it("binds the signed snapshot to the payload, user, and route", async () => {
    const snapshot = normalizeExtractionJobPayload(
      { job_id: JOB_ID, status: "SUCCESS", results: [] },
      JOB_ID
    );
    expect(snapshot).not.toBeNull();
    const encoded = encodeExtractionSnapshot(snapshot!);
    expect(encoded).not.toBeNull();
    const signature = await signExtractionSnapshot(
      encoded!,
      "user-1",
      ROUTE,
      "secret"
    );

    expect(
      await verifyExtractionSnapshot(encoded!, signature, "user-1", ROUTE, "secret")
    ).toBe(true);
    expect(
      await verifyExtractionSnapshot(encoded!, signature, "user-2", ROUTE, "secret")
    ).toBe(false);
    expect(
      await verifyExtractionSnapshot(
        encoded!,
        signature,
        "user-1",
        `${ROUTE}/nested`,
        "secret"
      )
    ).toBe(false);
    expect(decodeExtractionSnapshot(encoded!, JOB_ID)).toEqual(
      expect.objectContaining({ job_id: JOB_ID, status: "SUCCESS" })
    );
    expect(decodeExtractionSnapshot(encoded!, JOB_ID)).not.toHaveProperty("results");
  });

  it("refuses to encode an oversized snapshot header", () => {
    const encoded = encodeExtractionSnapshot({
      job_id: JOB_ID,
      status: "SUCCESS",
      collection_name: "x".repeat(8_000),
    });

    expect(encoded).toBeNull();
  });
});

describe("folding a poll response into page state", () => {
  const rendered: ExtractionJobResponse = {
    job_id: JOB_ID,
    status: "IN_PROGRESS",
    results: [],
    progress: { completed: 1, total: 4 },
    created_at: "2026-08-19T10:00:00Z",
    updated_at: "2026-08-19T10:00:05Z",
    collection_id: "col-1",
    collection_name: "Route contract collection",
    schema_id: "sch-1",
    schema_name: "Route contract extraction schema",
  };

  // The #524 wire capture: the poll answers with the identity fields nulled.
  const pollWithNulledMetadata: ExtractionJobResponse = {
    job_id: JOB_ID,
    status: "IN_PROGRESS",
    results: [],
    progress: { completed: 2, total: 4 },
    updated_at: "2026-08-19T10:00:10Z",
    collection_id: null,
    collection_name: null,
    schema_id: null,
    schema_name: null,
    created_at: null,
  };

  it("keeps identity metadata a response nulls, and takes the live fields", () => {
    const merged = mergeExtractionJobUpdate(rendered, pollWithNulledMetadata);

    expect(merged.schema_name).toBe("Route contract extraction schema");
    expect(merged.schema_id).toBe("sch-1");
    expect(merged.collection_name).toBe("Route contract collection");
    expect(merged.collection_id).toBe("col-1");
    expect(merged.created_at).toBe("2026-08-19T10:00:00Z");
    // The fields that legitimately move still move.
    expect(merged.progress).toEqual({ completed: 2, total: 4 });
    expect(merged.updated_at).toBe("2026-08-19T10:00:10Z");
  });

  it("keeps identity metadata a response omits entirely", () => {
    const { schema_name: _n, schema_id: _i, ...withoutSchema } =
      pollWithNulledMetadata;

    expect(mergeExtractionJobUpdate(rendered, withoutSchema).schema_name).toBe(
      "Route contract extraction schema"
    );
  });

  it("fills in identity metadata the first paint lacked", () => {
    const withoutSchema: ExtractionJobResponse = {
      ...rendered,
      schema_id: null,
      schema_name: null,
    };
    const pollWithSchema: ExtractionJobResponse = {
      ...pollWithNulledMetadata,
      schema_id: "sch-9",
      schema_name: "Resolved late",
    };

    const merged = mergeExtractionJobUpdate(withoutSchema, pollWithSchema);

    expect(merged.schema_name).toBe("Resolved late");
    expect(merged.schema_id).toBe("sch-9");
  });

  it("advances status and results, and adopts a terminal status", () => {
    const finished: ExtractionJobResponse = {
      ...pollWithNulledMetadata,
      status: "SUCCESS",
      progress: { completed: 4, total: 4 },
    };

    const merged = mergeExtractionJobUpdate(rendered, finished);

    expect(merged.status).toBe("SUCCESS");
    expect(merged.progress).toEqual({ completed: 4, total: 4 });
    expect(merged.schema_name).toBe("Route contract extraction schema");
  });

  it("never walks a terminal status back to an in-flight one", () => {
    const done: ExtractionJobResponse = { ...rendered, status: "SUCCESS" };
    const lateInFlight: ExtractionJobResponse = {
      ...pollWithNulledMetadata,
      status: "IN_PROGRESS",
    };

    expect(mergeExtractionJobUpdate(done, lateInFlight)).toBe(done);
  });
});
