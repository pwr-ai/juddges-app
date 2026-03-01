/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/server");

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  GET as getAdminPosts,
  POST as createAdminPost,
} from "@/app/api/blog/admin/posts/route";
import {
  DELETE as deleteAdminPost,
  PUT as updateAdminPost,
} from "@/app/api/blog/admin/posts/[id]/route";
import { GET as getAdminStats } from "@/app/api/blog/admin/stats/route";

global.fetch = jest.fn();

type AuthUserResponse = { data: { user: { id: string } | null }; error: null };
type AuthSessionResponse = { data: { session: { access_token: string } | null } };

function mockAuthenticatedClient(token = "test-token"): void {
  const getUser = jest
    .fn<Promise<AuthUserResponse>, []>()
    .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  const getSession = jest
    .fn<Promise<AuthSessionResponse>, []>()
    .mockResolvedValue({ data: { session: { access_token: token } } });

  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser,
      getSession,
    },
  });
}

function mockUnauthenticatedClient(): void {
  const getUser = jest
    .fn<Promise<AuthUserResponse>, []>()
    .mockResolvedValue({ data: { user: null }, error: null });
  const getSession = jest
    .fn<Promise<AuthSessionResponse>, []>()
    .mockResolvedValue({ data: { session: null } });

  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser,
      getSession,
    },
  });
}

describe("blog admin API routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://backend:8000";
  });

  it("forwards admin posts GET with auth headers", async () => {
    mockAuthenticatedClient("jwt-token");
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ data: [] }),
    });

    const response = await getAdminPosts(
      new NextRequest("http://localhost:3000/api/blog/admin/posts?page=1&limit=20")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/blog/admin/posts?page=1&limit=20",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          Authorization: "Bearer jwt-token",
        }),
      })
    );
  });

  it("rejects admin post creation when unauthenticated", async () => {
    mockUnauthenticatedClient();

    const response = await createAdminPost(
      new NextRequest("http://localhost:3000/api/blog/admin/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authentication required");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards post update and propagates backend failure", async () => {
    mockAuthenticatedClient("jwt-token");
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 500,
      json: async () => ({ detail: "backend failed" }),
    });

    const response = await updateAdminPost(
      new NextRequest("http://localhost:3000/api/blog/admin/posts/post-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.detail).toBe("backend failed");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/blog/admin/posts/post-1",
      expect.objectContaining({
        method: "PUT",
      })
    );
  });

  it("forwards post delete request", async () => {
    mockAuthenticatedClient("jwt-token");
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ success: true }),
    });

    const response = await deleteAdminPost(
      new NextRequest("http://localhost:3000/api/blog/admin/posts/post-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "post-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("forwards admin stats GET", async () => {
    mockAuthenticatedClient("jwt-token");
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({ total_posts: 1, published: 1 }),
    });

    const response = await getAdminStats();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_posts).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/blog/admin/stats",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          Authorization: "Bearer jwt-token",
        }),
      })
    );
  });
});
