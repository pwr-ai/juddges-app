import {
  jobLabel,
  mapJobsResponse,
  resolveResourceName,
  shortId,
} from "@/lib/publications/resource-names";

describe("publication resource names", () => {
  it("shortens long ids and keeps short ones", () => {
    expect(shortId("7dd87bca-2223-457d-a401-7a792f03453c")).toBe("7dd87bca…");
    expect(shortId("abc")).toBe("abc");
  });

  it("prefers the looked-up name, then the stored name, then a short id", () => {
    const available = [{ id: "s1", name: "Base schema" }];
    expect(resolveResourceName("s1", "stale", available)).toBe("Base schema");
    expect(resolveResourceName("s2", "Stored", available)).toBe("Stored");
    expect(resolveResourceName("7dd87bca-2223-457d", undefined, available)).toBe("7dd87bca…");
  });

  it("maps the { jobs } payload of /api/jobs to picker options", () => {
    const result = mapJobsResponse({
      jobs: [
        { id: "uuid", job_id: "celery-1", status: "SUCCESS", schema_name: "S", created_at: "2026-01-01" },
        { id: "uuid2", status: "SUCCESS" },
      ],
    });
    expect(result).toEqual([
      { job_id: "celery-1", status: "SUCCESS", schema_name: "S", created_at: "2026-01-01" },
    ]);
  });

  it("returns an empty list for unexpected payloads", () => {
    expect(mapJobsResponse([])).toEqual([]);
    expect(mapJobsResponse(null)).toEqual([]);
    expect(mapJobsResponse({ error: "x" })).toEqual([]);
  });

  it("labels jobs by schema name when known", () => {
    expect(jobLabel("abcdefghijkl", { job_id: "abcdefghijkl", status: "SUCCESS", schema_name: "S" })).toBe("S (abcdefgh…)");
    expect(jobLabel("abcdefghijkl", undefined)).toBe("abcdefgh…");
  });
});
