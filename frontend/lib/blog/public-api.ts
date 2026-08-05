import { proxyPublicBlog } from "@/app/api/blog/public-proxy";

export interface PublicBlogAuthor {
  id: string | null;
  name: string;
  avatar: string | null;
  title: string;
}

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string | null;
  featured_image?: string | null;
  author: PublicBlogAuthor;
  category: string;
  tags: string[];
  status: "published";
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  read_time?: number | null;
  views: number;
  likes_count: number;
  ai_summary?: string | null;
}

export interface PublicBlogPostDetail extends PublicBlogPost {
  related_posts: PublicBlogPost[];
}

export class BlogPostUpstreamError extends Error {
  constructor(public readonly status: number) {
    super(`Blog service returned HTTP ${status}`);
    this.name = "BlogPostUpstreamError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string";
}

function isPublicAuthor(value: unknown): value is PublicBlogAuthor {
  if (!isRecord(value)) return false;
  return (
    (value.id === null || typeof value.id === "string") &&
    typeof value.name === "string" &&
    isNullableString(value.avatar) &&
    typeof value.title === "string"
  );
}

function isPublicPost(value: unknown): value is PublicBlogPost {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.excerpt === "string" &&
    isNullableString(value.content) &&
    isNullableString(value.featured_image) &&
    isPublicAuthor(value.author) &&
    typeof value.category === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    value.status === "published" &&
    isNullableString(value.published_at) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    (value.read_time === null ||
      value.read_time === undefined ||
      typeof value.read_time === "number") &&
    typeof value.views === "number" &&
    typeof value.likes_count === "number" &&
    isNullableString(value.ai_summary)
  );
}

function isPublicPostDetail(value: unknown): value is PublicBlogPostDetail {
  return (
    isPublicPost(value) &&
    isRecord(value) &&
    Array.isArray(value.related_posts) &&
    value.related_posts.every(isPublicPost)
  );
}

/**
 * Server-only public blog detail loader. It uses the same bounded proxy and
 * no-store policy as the route handler so SSR and the BFF share one contract.
 */
export async function loadPublicBlogPost(
  slug: string,
): Promise<PublicBlogPostDetail | null> {
  const response = await proxyPublicBlog(
    `/blog/posts/${encodeURIComponent(slug)}`,
    new AbortController().signal,
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new BlogPostUpstreamError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Blog service returned invalid post data");
  }

  if (!isPublicPostDetail(payload)) {
    throw new Error("Blog service returned invalid post data");
  }
  return payload;
}
