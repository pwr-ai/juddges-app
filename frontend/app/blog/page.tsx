"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BlogPostCard } from "@/components/blog/blog-post-card";
import { toast } from "sonner";
import {
  Filter,
  BookOpen,
  GraduationCap,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Grid3x3,
  List,
} from "lucide-react";
import type { BlogCategory, BlogPost } from "@/types/blog";
import { cn } from "@/lib/utils";
import { Header, Badge, PageContainer, SearchInput, EmptyState, VariantButton, LightCard, FilterToggleGroup } from "@/lib/styles/components";
import { logger } from "@/lib/logger";

interface BlogPagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface BlogPostPayload extends BlogPost {
  likes_count?: number;
}

interface BlogPostsResponse {
  data: BlogPostPayload[];
  pagination: BlogPagination;
}

interface BlogCategoriesResponse {
  data: BlogCategory[];
}

const PAGE_SIZE = 6;

function normalizePosts(posts: BlogPostPayload[]): BlogPost[] {
  return posts.map(({ likes_count, ...post }) => ({
    ...post,
    likes: post.likes ?? likes_count,
  }));
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string; error?: string };
    return new Error(body.detail || body.error || `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

function postsUrl(page: number, category: string, search: string): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    sort: "published_at",
    order: "desc",
  });
  if (category !== "all") params.set("category", category);
  if (search.trim()) params.set("search", search.trim());
  return `/api/blog/posts?${params.toString()}`;
}

async function fetchPosts(
  page: number,
  category: string,
  search: string,
  signal?: AbortSignal,
): Promise<BlogPostsResponse> {
  const response = await fetch(postsUrl(page, category, search), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as BlogPostsResponse;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function BlogPage(): React.JSX.Element {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [pagination, setPagination] = useState<BlogPagination | null>(null);
  const [postsLoading, setPostsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [postsRetryKey, setPostsRetryKey] = useState(0);
  const [categoriesRetryKey, setCategoriesRetryKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const filterGeneration = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadCategories = async (): Promise<void> => {
      try {
        setCategoriesLoading(true);
        setCategoriesError(null);
        const response = await fetch("/api/blog/categories", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const body = (await response.json()) as BlogCategoriesResponse;
        setCategories(body.data);
      } catch (error) {
        if (isAbortError(error)) return;
        logger.error("Error fetching blog categories", error);
        setCategoriesError(error instanceof Error ? error.message : "Failed to load blog categories");
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    };

    void loadCategories();
    return () => controller.abort();
  }, [categoriesRetryKey]);

  useEffect(() => {
    const pendingLoadMore = loadMoreController.current;
    pendingLoadMore?.abort();
    if (loadMoreController.current === pendingLoadMore) {
      loadMoreController.current = null;
      setLoadingMore(false);
    }

    const debounce = setTimeout(() => {
      setCommittedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    filterGeneration.current += 1;
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setLoadingMore(false);

    const loadFirstPage = async (): Promise<void> => {
      try {
        setPostsLoading(true);
        setPostsError(null);
        setLoadMoreError(null);
        const body = await fetchPosts(
          1,
          selectedCategory,
          committedSearch,
          controller.signal,
        );
        setPosts(normalizePosts(body.data));
        setPagination(body.pagination);
      } catch (error) {
        if (isAbortError(error)) return;
        logger.error("Error fetching blog posts", error);
        const message = error instanceof Error ? error.message : "Failed to load blog posts";
        setPostsError(message);
        toast.error("Failed to load blog posts", { description: message });
      } finally {
        if (!controller.signal.aborted) setPostsLoading(false);
      }
    };

    void loadFirstPage();
    return () => {
      controller.abort();
      const pendingLoadMore = loadMoreController.current;
      pendingLoadMore?.abort();
      if (loadMoreController.current === pendingLoadMore) {
        loadMoreController.current = null;
      }
    };
  }, [committedSearch, postsRetryKey, selectedCategory]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!pagination?.has_next || loadingMore) return;

    const controller = new AbortController();
    const requestGeneration = filterGeneration.current;
    loadMoreController.current = controller;

    try {
      setLoadingMore(true);
      setLoadMoreError(null);
      const body = await fetchPosts(
        pagination.page + 1,
        selectedCategory,
        committedSearch,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        requestGeneration !== filterGeneration.current
      ) {
        return;
      }
      const nextPosts = normalizePosts(body.data);
      setPosts((current) => {
        const unique = new Map(current.map((post) => [post.id, post]));
        for (const post of nextPosts) unique.set(post.id, post);
        return Array.from(unique.values());
      });
      setPagination(body.pagination);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      logger.error("Error loading more blog posts", error);
      const message = error instanceof Error ? error.message : "Failed to load more blog posts";
      setLoadMoreError(message);
      toast.error("Failed to load more blog posts", { description: message });
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  }, [committedSearch, loadingMore, pagination, selectedCategory]);

  const loading = postsLoading;
  const error = postsError;
  const searchPending = searchQuery.trim() !== committedSearch;
  const total = pagination?.total ?? posts.length;

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero Section */}
      <div className="mb-8">
        {/* Credibility Badge */}
        <LightCard padding="sm" className="mb-6">
          <div className="flex items-center gap-3 text-sm">
            <div className="p-2 rounded-lg bg-primary/10">
              <GraduationCap className="size-5 text-primary" />
            </div>
            <span className="text-muted-foreground font-medium">
              Research Blog by Wrocław University of Science and Technology
            </span>
          </div>
        </LightCard>

        {/* Title Section */}
        <div className="mb-8">
          <Badge variant="outline" className="mb-4 flex items-center gap-1.5 w-fit">
            <Sparkles className="size-3" />
            Latest Insights
          </Badge>
          <Header
            icon={Sparkles}
            title="Research & Insights"
            size="4xl"
            description={
              <>
                Explore the latest research findings, tutorials, and insights from
                our team of{" "}
                <span className="text-foreground font-semibold">
                  judgments analysis experts
                </span>
              </>
            }
          />
        </div>

        {/* Search and Filters Section */}
        <div className="space-y-4 mb-8">
          {/* Search Bar */}
          <div className="w-full">
            <SearchInput
              type="search"
              placeholder="Search blog posts..."
              size="lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Categories Filter */}
          <LightCard padding="md">
            {categoriesLoading && (
              <span className="sr-only">Loading blog categories…</span>
            )}
            {categoriesError && (
              <div
                role="status"
                className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
              >
                <span>Categories are temporarily unavailable. Showing all posts.</span>
                <VariantButton
                  intent="secondary"
                  size="sm"
                  onClick={() => setCategoriesRetryKey((current) => current + 1)}
                >
                  Retry Categories
                </VariantButton>
              </div>
            )}
            <FilterToggleGroup
              label=""
              options={[
                { value: "all", label: "All Posts" },
                ...categories.map((category) => ({
                  value: category.name,
                  label: category.name,
                })),
              ]}
              value={selectedCategory}
              onChange={(value) => setSelectedCategory(value as string)}
              className="overflow-x-auto"
              containerClassName="overflow-x-auto"
            />
          </LightCard>
        </div>
      </div>

      {/* Main Content */}
      <div>
        {/* Results Header with View Toggle */}
        <LightCard padding="sm" className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {total} post{total !== 1 ? "s" : ""}{" "}
                found
              </span>
            </div>

            <div className="flex items-center gap-1 border rounded-lg p-1">
              <VariantButton intent="icon"
                icon={Grid3x3}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                variant={viewMode === "grid" ? "default" : "muted"}
                size="sm"
              />
              <VariantButton intent="icon"
                icon={List}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                variant={viewMode === "list" ? "default" : "muted"}
                size="sm"
              />
            </div>
          </div>
        </LightCard>

        {/* Posts Grid/List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            <span className="sr-only">Loading blog posts…</span>
            {[...Array(6)].map((_, i) => (
              <LightCard key={i} className="h-full min-h-[400px] p-0">
                <div className="relative h-64 bg-gradient-to-br from-muted/50 to-muted/30 animate-pulse" />
                <div className="p-6 space-y-4">
                  <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-5 w-full rounded bg-muted animate-pulse" />
                    <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-4 w-full rounded bg-muted animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                </div>
              </LightCard>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <h2 className="text-xl font-semibold text-foreground">Unable to load blog posts</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <VariantButton
              intent="secondary"
              className="mt-5"
              onClick={() => setPostsRetryKey((current) => current + 1)}
            >
              Try Again
            </VariantButton>
          </div>
        ) : posts.length > 0 ? (
          <div
            className={cn(
              "grid gap-8",
              viewMode === "grid"
                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                : "grid-cols-1 max-w-4xl mx-auto"
            )}
          >
            {posts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No posts found"
            description={
              searchQuery || selectedCategory !== "all"
                ? "Try adjusting your search or filter criteria"
                : "There are no published posts yet"
            }
            secondaryAction={
              searchQuery || selectedCategory !== "all"
                ? {
                    label: "Clear Filters",
                    onClick: () => {
                      setSearchQuery("");
                      setSelectedCategory("all");
                    },
                  }
                : undefined
            }
          />
        )}

        {/* Load More */}
        {posts.length > 0 && !loading && !searchPending && pagination?.has_next && (
          <div className="text-center mt-12">
            {loadMoreError && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {loadMoreError}
              </p>
            )}
            <VariantButton intent="secondary"
              size="md"
              icon={TrendingUp}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading More…" : "Load More Posts"}
            </VariantButton>
          </div>
        )}
      </div>

      {/* CTA Section */}
      <LightCard padding="lg" className="mt-16 text-center">
        <h2 className="text-3xl font-bold mb-4 bg-gradient-to-br from-foreground via-primary to-primary bg-clip-text text-transparent">
          Stay Updated
        </h2>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
          Get notified when we publish new research insights and tutorials
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
          <SearchInput
            type="email"
            placeholder="Enter your email"
            size="md"
            className="flex-1"
          />
          <VariantButton intent="primary" size="md" icon={ArrowRight}>
            Subscribe
          </VariantButton>
        </div>
      </LightCard>
    </PageContainer>
  );
}
