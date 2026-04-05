"use client";

import React, { useState, useEffect } from "react";
import { BlogPostCard } from "@/components/blog/blog-post-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { SkeletonStat, SkeletonCard } from "@/components/ui/skeleton-card";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  PageContainer,
  Header,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  SearchInput,
  EmptyState,
} from "@/lib/styles/components";
import {
  Plus,
  Filter,
  Settings,
  MoreVertical,
  Trash2,
  Eye,
  FileText,
  TrendingUp,
  Users,
  Grid3x3,
  List,
  Download,
} from "lucide-react";
import type { BlogPost } from "@/types/blog";
import {
  deleteAdminPost,
  fetchAdminPosts,
  fetchAdminStats,
  type BlogStats,
} from "@/lib/blog/admin-api";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";

export default function AdminBlogPage(): React.JSX.Element {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([]);
  const [stats, setStats] = useState<BlogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const loadBlogAdminData = async (): Promise<void> => {
      try {
        setLoading(true);
        const [postsResponse, statsResponse] = await Promise.all([
          fetchAdminPosts({ page: 1, limit: 200 }),
          fetchAdminStats(),
        ]);

        setPosts(postsResponse.data);
        setFilteredPosts(postsResponse.data);
        setStats(statsResponse);
      } catch (error) {
        logger.error("Error fetching blog admin data: ", error);
        toast.error("Failed to load posts", {
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
        });
      } finally {
        setLoading(false);
      }
    };

    loadBlogAdminData();
  }, []);

  useEffect(() => {
    let filtered = posts;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((post) => post.status === statusFilter);
    }

    setFilteredPosts(filtered);
  }, [searchQuery, statusFilter, posts]);

  const handleEdit = (id: string): void => {
    router.push(`/blog/admin/${id}`);
  };

  const handleDelete = async (id: string): Promise<void> => {
    try {
      // Confirm deletion
      const confirmed = window.confirm(
        "Are you sure you want to delete this post? This action cannot be undone."
      );

      if (!confirmed) {
        return;
      }

      await deleteAdminPost(id);
      setPosts((current) => current.filter((post) => post.id !== id));
      setFilteredPosts((current) => current.filter((post) => post.id !== id));

      try {
        const refreshedStats = await fetchAdminStats();
        setStats(refreshedStats);
      } catch (refreshError) {
        logger.warn("Failed to refresh stats after delete", refreshError);
      }

      toast.success("Post deleted successfully", {
        description: "The post has been permanently removed.",
      });
    } catch (error) {
      logger.error("Error deleting post: ", error);
      toast.error("Failed to delete post", {
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  return (
    <PageContainer width="standard" className="py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
          <Header
            title="Blog Management"
            description="Manage your blog posts, create new content, and track engagement."
            size="4xl"
          />
          <div className="flex flex-wrap gap-3">
            <SecondaryButton size="lg" icon={Settings}>
              Settings
            </SecondaryButton>
            <PrimaryButton
              size="lg"
              icon={Plus}
              onClick={() => router.push("/blog/admin/new")}
            >
              New Post
            </PrimaryButton>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="mb-8">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <SkeletonStat key={i} />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              value={stats.published.toString()}
              label="Published Posts"
              icon={<FileText />}
              gradient="from-blue-500/10 to-blue-600/5"
              trend="success"
              trendValue={`${stats.total_posts} total`}
            />
            <StatCard
              value={stats.total_views.toLocaleString()}
              label="Total Views"
              icon={<Eye />}
              gradient="from-purple-500/10 to-purple-600/5"
            />
            <StatCard
              value={stats.total_likes.toString()}
              label="Total Likes"
              icon={<TrendingUp />}
              gradient="from-amber-500/10 to-amber-600/5"
            />
            <StatCard
              value={`${Math.round(stats.avg_read_time)} min`}
              label="Avg. Read Time"
              icon={<Users />}
              gradient="from-green-500/10 to-green-600/5"
            />
          </div>
        ) : null}
      </div>

      {/* Filters & Search */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {/* Search */}
          <div className="w-full lg:max-w-md">
            <SearchInput
              type="search"
              placeholder="Search posts..."
              size="md"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-11">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>

            {/* View Toggle */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <IconButton
                icon={Grid3x3}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                variant={viewMode === "grid" ? "default" : "muted"}
                size="sm"
              />
              <IconButton
                icon={List}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                variant={viewMode === "list" ? "default" : "muted"}
                size="sm"
              />
            </div>

            {/* Bulk Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SecondaryButton className="gap-2 h-11">
                  <MoreVertical className="size-4" />
                  Actions
                </SecondaryButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Download className="mr-2 size-4" />
                  Export Posts
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 size-4" />
                  Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center gap-2 mt-4">
          <Filter className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}{" "}
            found
          </span>
        </div>
      </div>

      {/* Posts Grid */}
      <div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div
            className={cn(
              "grid gap-8",
              viewMode === "grid"
                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                : "grid-cols-1 max-w-4xl mx-auto"
            )}
          >
            {filteredPosts.map((post) => (
              <BlogPostCard
                key={post.id}
                post={post}
                showActions={true}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No posts found"
            description="Try adjusting your search or filter criteria"
            secondaryAction={{
              label: "Clear Filters",
              onClick: () => {
                setSearchQuery("");
                setStatusFilter("all");
              },
            }}
          />
        )}
      </div>
    </PageContainer>
  );
}
