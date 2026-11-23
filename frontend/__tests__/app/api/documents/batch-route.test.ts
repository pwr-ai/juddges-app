/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/supabase/server");

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "@/app/api/documents/batch/route";

function mockAuthed() {
  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
    },
  });
}

function backendReturns(status: number) {
  (global.fetch as jest.Mock).mockImplementation(async () =>
    new Response(JSON.stringify({ detail: "nope" }), { status }),
  );
}

const post = () =>
  POST(
    new NextRequest("http://localhost:3000/api/documents/batch", {
      method: "POST",
      body: JSON.stringify({ document_ids: ["a"] }),
    }),
  );
const get = () =>
  GET(new NextRequest("http://localhost:3000/api/documents/batch?ids=a"));

describe("/api/documents/batch BFF status mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthed();
  });

  it.each([401, 403])("maps backend %i to 502 (bad API key is not an expired session)", async (status) => {
    backendReturns(status);
    expect((await post()).status).toBe(502);
    expect((await get()).status).toBe(502);
  });

  it.each([429, 500, 503])("passes backend %i through", async (status) => {
    backendReturns(status);
    expect((await post()).status).toBe(status);
    expect((await get()).status).toBe(status);
  });
});
