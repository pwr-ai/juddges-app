"use client";

import React, { useState, useEffect } from "react";
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
import type { BlogPost, BlogCategory } from "@/types/blog";
import { cn } from "@/lib/utils";
import {
  Header,
  Badge,
  PageContainer,
  SearchInput,
  EmptyState,
  SecondaryButton,
  PrimaryButton,
  LightCard,
  IconButton,
  FilterToggleGroup,
} from "@/lib/styles/components";

// Mock data - replace with actual API calls
const mockCategories: BlogCategory[] = [
  {
    id: "1",
    name: "Research",
    slug: "research",
    description: "Latest research findings and academic papers",
    color: "blue",
    icon: "📊",
  },
  {
    id: "2",
    name: "Tutorials",
    slug: "tutorials",
    description: "Step-by-step guides and how-tos",
    color: "purple",
    icon: "📚",
  },
  {
    id: "3",
    name: "Updates",
    slug: "updates",
    description: "Platform updates and announcements",
    color: "green",
    icon: "🔔",
  },
  {
    id: "4",
    name: "Insights",
    slug: "insights",
    description: "Expert insights and analysis",
    color: "amber",
    icon: "💡",
  },
];

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
      avatar: "/api/placeholder/100/100",
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
      "This article discusses the transformative impact of AI on legal research, highlighting key trends such as natural language processing, predictive analytics, and automated document review.",
  },
  {
    id: "2",
    slug: "understanding-tax-interpretations",
    title: "Understanding Polish Tax Interpretations: A Complete Guide",
    excerpt:
      "A comprehensive guide to navigating tax interpretations in Poland, with practical examples and expert insights.",
    author: {
      name: "Anna Kowalska",
      title: "Tax Law Expert",
      avatar: "/api/placeholder/100/100",
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
      "We're excited to announce new AI-powered document analysis features that make legal research faster and more accurate.",
    featured_image: "/api/placeholder/800/600",
    author: {
      name: "System Admin",
      title: "Product Team",
      avatar: "/api/placeholder/100/100",
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
    ai_summary:
      "New features include semantic search improvements, citation analysis, and automated legal entity recognition.",
  },
  {
    id: "4",
    slug: "supreme-court-decisions-analysis",
    title: "Analyzing Recent Supreme Court Decisions: Key Takeaways",
    excerpt:
      "An in-depth analysis of recent Supreme Court rulings and their implications for legal practice.",
    author: {
      name: "Dr. Piotr Nowak",
      title: "Legal Scholar",
      avatar: "/api/placeholder/100/100",
    },
    status: "draft",
    created_at: "2024-12-28T10:00:00Z",
    updated_at: "2024-12-30T15:00:00Z",
    tags: ["Supreme Court", "Analysis", "Case Law"],
    category: "Insights",
    read_time: 15,
  },
];

export default function BlogPage(): React.JSX.Element {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const fetchPosts = async (): Promise<void> => {
      try {
        setLoading(true);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        const publishedPosts = mockPosts.filter((p) => p.status === "published");
        setPosts(publishedPosts);
        setFilteredPosts(publishedPosts);
      } catch (error) {
        console.error("Error fetching posts:", error);
        toast.error("Failed to load blog posts", {
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
          post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
          post.tags.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase())
          )
      );
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((post) => post.category === selectedCategory);
    }

    setFilteredPosts(filtered);
  }, [searchQuery, selectedCategory, posts]);

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
            <FilterToggleGroup
              label=""
              options={[
                { value: "all", label: "All Posts" },
                ...mockCategories.map((category) => ({
                  value: category.name,
                  label: (
                    <>
                      <span className="mr-1.5">{category.icon}</span>
                      {category.name}
                    </>
                  ),
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
                {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}{" "}
                found
              </span>
            </div>

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
          </div>
        </LightCard>

        {/* Posts Grid/List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
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
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No posts found"
            description="Try adjusting your search or filter criteria"
            secondaryAction={{
              label: "Clear Filters",
              onClick: () => {
                setSearchQuery("");
                setSelectedCategory("all");
              },
            }}
          />
        )}

        {/* Load More */}
        {filteredPosts.length > 0 && !loading && (
          <div className="text-center mt-12">
            <SecondaryButton
              size="md"
              icon={TrendingUp}
              onClick={() => {
                // TODO: Implement load more functionality
              }}
            >
              Load More Posts
            </SecondaryButton>
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
          <PrimaryButton size="md" icon={ArrowRight}>
            Subscribe
          </PrimaryButton>
        </div>
      </LightCard>
    </PageContainer>
  );
}
