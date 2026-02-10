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
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

// Mock posts including drafts for admin view
const mockPosts: BlogPost[] = [
  {
    id: "1",
    slug: "ai-legal-research-future",
    title: "The Future of AI in Legal Research: Trends and Innovations",
    excerpt:
      "Exploring how artificial intelligence is revolutionizing legal research and what it means for the future of law practice.",
    featured_image: "/api/placeholder/800/600",
    author: {
      name: "Łukasz Augustyniak",
      title: "Research Lead @ WUST",
    },
    status: "published",
    published_at: "2025-01-10T10:00:00Z",
    created_at: "2025-01-08T10:00:00Z",
    updated_at: "2025-01-10T10:00:00Z",
    tags: ["AI", "Legal Tech", "Research"],
    category: "Research",
    read_time: 8,
    views: 1247,
    likes: 89,
    ai_summary:
      "This article discusses the transformative impact of AI on legal research.",
  },
  {
    id: "2",
    slug: "understanding-tax-interpretations",
    title: "Understanding Polish Tax Interpretations: A Complete Guide",
    excerpt:
      "A comprehensive guide to navigating tax interpretations in Poland.",
    author: {
      name: "Anna Kowalska",
      title: "Tax Law Expert",
    },
    status: "published",
    published_at: "2025-01-05T14:30:00Z",
    created_at: "2025-01-03T10:00:00Z",
    updated_at: "2025-01-05T14:30:00Z",
    tags: ["Tax", "Legal", "Poland"],
    category: "Tutorials",
    read_time: 12,
    views: 2341,
    likes: 156,
  },
  {
    id: "3",
    slug: "new-document-analysis-features",
    title: "Introducing Advanced Document Analysis Features",
    excerpt:
      "We're excited to announce new AI-powered document analysis features.",
    featured_image: "/api/placeholder/800/600",
    author: {
      name: "System Admin",
      title: "Product Team",
    },
    status: "published",
    published_at: "2025-01-02T09:00:00Z",
    created_at: "2025-01-01T10:00:00Z",
    updated_at: "2025-01-02T09:00:00Z",
    tags: ["Updates", "Features", "AI"],
    category: "Updates",
    read_time: 5,
    views: 3892,
    likes: 234,
  },
  {
    id: "4",
    slug: "supreme-court-decisions-analysis",
    title: "Analyzing Recent Supreme Court Decisions: Key Takeaways",
    excerpt:
      "An in-depth analysis of recent Supreme Court rulings and their implications.",
    author: {
      name: "Dr. Piotr Nowak",
      title: "Legal Scholar",
    },
    status: "draft",
    created_at: "2024-12-28T10:00:00Z",
    updated_at: "2024-12-30T15:00:00Z",
    tags: ["Supreme Court", "Analysis", "Case Law"],
    category: "Insights",
    read_time: 15,
    views: 0,
    likes: 0,
  },
  {
    id: "5",
    slug: "upcoming-legal-changes-2025",
    title: "Upcoming Legal Changes in 2025: What You Need to Know",
    excerpt: "A preview of important legal changes coming in 2025.",
    author: {
      name: "Anna Kowalska",
      title: "Tax Law Expert",
    },
    status: "scheduled",
    published_at: "2025-02-01T09:00:00Z",
    created_at: "2025-01-05T10:00:00Z",
    updated_at: "2025-01-08T15:00:00Z",
    tags: ["Legal", "Updates", "2025"],
    category: "Updates",
    read_time: 10,
    views: 0,
    likes: 0,
  },
];

interface BlogStats {
  total_posts: number;
  published: number;
  drafts: number;
  scheduled: number;
  total_views: number;
  total_likes: number;
  avg_read_time: number;
}

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
    const fetchPosts = async (): Promise<void> => {
      try {
        setLoading(true);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        setPosts(mockPosts);
        setFilteredPosts(mockPosts);

        // Calculate stats
        const published = mockPosts.filter((p) => p.status === "published");
        setStats({
          total_posts: mockPosts.length,
          published: published.length,
          drafts: mockPosts.filter((p) => p.status === "draft").length,
          scheduled: mockPosts.filter((p) => p.status === "scheduled").length,
          total_views: published.reduce((sum, p) => sum + (p.views || 0), 0),
          total_likes: published.reduce((sum, p) => sum + (p.likes || 0), 0),
          avg_read_time:
            published.length > 0
              ? published.reduce((sum, p) => sum + (p.read_time || 0), 0) /
                published.length
              : 0,
        });
      } catch (error) {
        console.error("Error fetching posts:", error);
        toast.error("Failed to load posts", {
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
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
      const confirmed = window.confirm("Are you sure you want to delete this post? This action cannot be undone.");
      
      if (!confirmed) {
        return;
      }

      // TODO: Implement API call to delete post
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      setPosts(posts.filter((p) => p.id !== id));
      setFilteredPosts(filteredPosts.filter((p) => p.id !== id));
      
      toast.success("Post deleted successfully", {
        description: "The post has been permanently removed.",
      });
    } catch (error) {
      console.error("Error deleting post:", error);
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
