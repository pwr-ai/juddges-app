import type { BlogPost } from "@/types/blog";

export interface BlogStats {
  total_posts: number;
  published: number;
  drafts: number;
  scheduled: number;
  total_views: number;
  total_likes: number;
  avg_read_time: number;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface PostsResponse {
  data: BlogPost[];
  pagination: Pagination;
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
  detail?: string;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const errorPayload = payload as ApiResult<unknown>;
  if (typeof errorPayload.error === "string") {
    return errorPayload.error;
  }
  if (typeof errorPayload.detail === "string") {
    return errorPayload.detail;
  }

  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Request failed"));
  }

  return payload as T;
}

export async function fetchAdminPosts(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PostsResponse> {
  const query = new URLSearchParams();
  if (params?.page) {
    query.set("page", String(params.page));
  }
  if (params?.limit) {
    query.set("limit", String(params.limit));
  }
  if (params?.status && params.status !== "all") {
    query.set("status", params.status);
  }
  if (params?.search) {
    query.set("search", params.search);
  }

  const url = `/api/blog/admin/posts${query.toString() ? `?${query.toString()}` : ""}`;
  return requestJson<PostsResponse>(url);
}

export async function fetchAdminStats(): Promise<BlogStats> {
  return requestJson<BlogStats>("/api/blog/admin/stats");
}

export async function fetchAdminPostById(id: string): Promise<BlogPost> {
  const payload = await requestJson<ApiResult<BlogPost>>(`/api/blog/admin/posts/${id}`);
  if (!payload.data) {
    throw new Error("Post not found");
  }
  return payload.data;
}

export async function createAdminPost(
  postData: Partial<BlogPost>
): Promise<BlogPost> {
  const payload = await requestJson<ApiResult<BlogPost>>("/api/blog/admin/posts", {
    method: "POST",
    body: JSON.stringify(postData),
  });
  if (!payload.data) {
    throw new Error("Failed to create post");
  }
  return payload.data;
}

export async function updateAdminPost(
  id: string,
  postData: Partial<BlogPost>
): Promise<BlogPost> {
  const payload = await requestJson<ApiResult<BlogPost>>(`/api/blog/admin/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(postData),
  });
  if (!payload.data) {
    throw new Error("Failed to update post");
  }
  return payload.data;
}

export async function deleteAdminPost(id: string): Promise<void> {
  await requestJson(`/api/blog/admin/posts/${id}`, {
    method: "DELETE",
  });
}
