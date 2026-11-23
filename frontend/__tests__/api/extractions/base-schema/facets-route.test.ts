/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  })),
}));

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { GET } from "@/app/api/extractions/base-schema/facets/[field]/route";

const call = (qs: string) =>
  GET(
    new NextRequest(`http://localhost:3000/api/extractions/base-schema/facets/appellant${qs}`),
    { params: Promise.resolve({ field: "appellant" }) },
  );

describe("GET /api/extractions/base-schema/facets/[field]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
  });

  it("forwards jurisdiction and nothing else", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ field: "appellant", counts: [], total: 0 }),
    });
    await call("?jurisdiction=PL&evil=1");
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toMatch(/\/extractions\/base-schema\/facets\/appellant\?jurisdiction=PL$/);
  });

  it("sends no query string without jurisdiction", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ counts: [] }),
    });
    await call("");
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url.endsWith("/facets/appellant")).toBe(true);
  });

  it("turns a FastAPI 422 detail array into a string and keeps the status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ msg: "Input should be 'PL' or 'UK'", loc: ["query", "jurisdiction"] }],
      }),
    });
    const res = await call("?jurisdiction=DE");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Input should be 'PL' or 'UK'");
  });
});
