/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("@/lib/supabase/server");

global.fetch = jest.fn();

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/jobs/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const JOB_ID = "22222222-3333-4444-8555-666666666666";
const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SCHEMA_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mockSupabaseAuth(userId: string | null) {
  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("not authed"),
      }),
    },
    from: jest.fn(),
  };
  (createClient as jest.Mock).mockResolvedValue(supabase);
  return supabase;
}

describe("GET /api/jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabaseAuth(null);

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns jobs with collection and schema names", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const jobsData = [
      {
        job_id: JOB_ID,
        user_id: USER_ID,
        collection_id: COLLECTION_ID,
        schema_id: SCHEMA_ID,
        status: "SUCCESS",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:05:00Z",
        completed_at: "2026-01-01T00:05:00Z",
        started_at: "2026-01-01T00:00:30Z",
        completed_documents: 5,
        total_documents: 5,
      },
    ];

    // Jobs query chain
    const jobsLimitMock = jest.fn().mockResolvedValue({
      data: jobsData,
      error: null,
    });
    const jobsOrderMock = jest.fn().mockReturnValue({ limit: jobsLimitMock });
    const jobsEqMock = jest.fn().mockReturnValue({ order: jobsOrderMock });
    const jobsSelectMock = jest.fn().mockReturnValue({ eq: jobsEqMock });

    // Collection lookup
    const collectionsInResult = { data: [{ id: COLLECTION_ID, name: "Test Collection" }], error: null };

    // Schema lookup
    const schemasInResult = { data: [{ id: SCHEMA_ID, name: "Test Schema" }], error: null };

    // User profiles
    const profilesInResult = { data: [{ id: USER_ID, email: "user@test.com" }], error: null };

    supabase.from = jest.fn().mockImplementation((table: string) => {
      if (table === "extraction_jobs") {
        return { select: jobsSelectMock };
      }
      if (table === "collections") {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue(collectionsInResult),
          }),
        };
      }
      if (table === "extraction_schemas") {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue(schemasInResult),
          }),
        };
      }
      if (table === "user_profiles") {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue(profilesInResult),
          }),
        };
      }
      return {};
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].collection_name).toBe("Test Collection");
    expect(body.jobs[0].schema_name).toBe("Test Schema");
    expect(body.jobs[0].user).toEqual({ email: "user@test.com" });
    expect(body.total).toBe(1);
  });

  it("returns empty jobs list when no jobs exist", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const jobsLimitMock = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const jobsOrderMock = jest.fn().mockReturnValue({ limit: jobsLimitMock });
    const jobsEqMock = jest.fn().mockReturnValue({ order: jobsOrderMock });
    const jobsSelectMock = jest.fn().mockReturnValue({ eq: jobsEqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: jobsSelectMock,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it("returns 500 when database query fails", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const jobsLimitMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });
    const jobsOrderMock = jest.fn().mockReturnValue({ limit: jobsLimitMock });
    const jobsEqMock = jest.fn().mockReturnValue({ order: jobsOrderMock });
    const jobsSelectMock = jest.fn().mockReturnValue({ eq: jobsEqMock });

    supabase.from = jest.fn().mockReturnValue({
      select: jobsSelectMock,
    });

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch jobs");
  });

  it("refreshes in-progress jobs from backend", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const pendingJob = {
      job_id: JOB_ID,
      user_id: USER_ID,
      collection_id: COLLECTION_ID,
      schema_id: SCHEMA_ID,
      status: "PENDING",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: new Date().toISOString(), // recent
      started_at: null,
      completed_at: null,
      completed_documents: 0,
      total_documents: 5,
    };

    const jobsLimitMock = jest.fn().mockResolvedValue({
      data: [pendingJob],
      error: null,
    });
    const jobsOrderMock = jest.fn().mockReturnValue({ limit: jobsLimitMock });
    const jobsEqMock = jest.fn().mockReturnValue({ order: jobsOrderMock });
    const jobsSelectMock = jest.fn().mockReturnValue({ eq: jobsEqMock });

    // For the refresh: backend call and Supabase update
    const updateSelectResult = jest.fn().mockResolvedValue({
      data: [{ status: "STARTED" }],
      error: null,
    });
    const updateEqMock = jest.fn().mockReturnValue({ select: updateSelectResult });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

    // Job exists check for refresh
    const existsSingleMock = jest.fn().mockResolvedValue({
      data: { job_id: JOB_ID, status: "PENDING" },
      error: null,
    });
    const existsEqMock = jest.fn().mockReturnValue({ single: existsSingleMock });
    const existsSelectMock = jest.fn().mockReturnValue({ eq: existsEqMock });

    let fromCallCount = 0;
    supabase.from = jest.fn().mockImplementation((table: string) => {
      fromCallCount++;
      if (table === "extraction_jobs") {
        if (fromCallCount === 1) {
          // Initial fetch
          return { select: jobsSelectMock };
        }
        if (fromCallCount === 2) {
          // Verify existence for refresh
          return { select: existsSelectMock };
        }
        if (fromCallCount === 3) {
          // Update after refresh
          return { update: updateMock };
        }
        // Re-fetch after refresh
        return { select: jobsSelectMock };
      }
      // collections, schemas, profiles
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    // Backend refresh response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: JOB_ID,
        status: "STARTED",
        results: [],
      }),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    // Backend should have been called to refresh status
    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/extractions/${JOB_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
        }),
      })
    );
  });

  it("calculates elapsed time and estimated remaining time", async () => {
    const supabase = mockSupabaseAuth(USER_ID);

    const now = new Date();
    const startedAt = new Date(now.getTime() - 60000); // 60 seconds ago

    const processingJob = {
      job_id: JOB_ID,
      user_id: USER_ID,
      collection_id: null,
      schema_id: null,
      status: "PROCESSING",
      created_at: startedAt.toISOString(),
      updated_at: now.toISOString(),
      started_at: startedAt.toISOString(),
      completed_at: null,
      completed_documents: 3,
      total_documents: 6,
    };

    const jobsLimitMock = jest.fn().mockResolvedValue({
      data: [processingJob],
      error: null,
    });
    const jobsOrderMock = jest.fn().mockReturnValue({ limit: jobsLimitMock });
    const jobsEqMock = jest.fn().mockReturnValue({ order: jobsOrderMock });
    const jobsSelectMock = jest.fn().mockReturnValue({ eq: jobsEqMock });

    // For refresh flow
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: JOB_ID,
        status: "PROCESSING",
        results: [
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
        ],
      }),
    });

    let fromCallCount = 0;
    supabase.from = jest.fn().mockImplementation((table: string) => {
      fromCallCount++;
      if (table === "extraction_jobs" && fromCallCount === 1) {
        return { select: jobsSelectMock };
      }
      if (table === "extraction_jobs") {
        // For refresh and re-fetch, return same data
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { job_id: JOB_ID, status: "PROCESSING" },
                error: null,
              }),
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [processingJob],
                  error: null,
                }),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [{ status: "PROCESSING" }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobs[0].elapsed_time_seconds).toBeGreaterThan(0);
    expect(body.jobs[0].estimated_time_remaining_seconds).toBeGreaterThanOrEqual(0);
    expect(body.jobs[0].avg_time_per_document_seconds).toBeGreaterThan(0);
  });
});
