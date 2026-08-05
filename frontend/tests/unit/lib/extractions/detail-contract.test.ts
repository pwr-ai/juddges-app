/**
 * @jest-environment node
 */

import {
  decodeExtractionSnapshot,
  encodeExtractionSnapshot,
  normalizeExtractionJobPayload,
  signExtractionSnapshot,
  verifyExtractionSnapshot,
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

  it("binds the signed snapshot to the payload, user, and route", async () => {
    const snapshot = normalizeExtractionJobPayload(
      { job_id: JOB_ID, status: "SUCCESS", results: [] },
      JOB_ID
    );
    expect(snapshot).not.toBeNull();
    const encoded = encodeExtractionSnapshot(snapshot!);
    const signature = await signExtractionSnapshot(
      encoded,
      "user-1",
      ROUTE,
      "secret"
    );

    expect(
      await verifyExtractionSnapshot(encoded, signature, "user-1", ROUTE, "secret")
    ).toBe(true);
    expect(
      await verifyExtractionSnapshot(encoded, signature, "user-2", ROUTE, "secret")
    ).toBe(false);
    expect(
      await verifyExtractionSnapshot(
        encoded,
        signature,
        "user-1",
        `${ROUTE}/nested`,
        "secret"
      )
    ).toBe(false);
    expect(decodeExtractionSnapshot(encoded, JOB_ID)).toEqual(snapshot);
  });
});
