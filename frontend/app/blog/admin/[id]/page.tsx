"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PostEditor } from "@/components/blog/admin/post-editor";
import { ArrowLeft } from "lucide-react";
import type { BlogPost } from "@/types/blog";
import { toast } from "sonner";
import {
  PageContainer,
  Header,
  SecondaryButton,
  Badge,
  IconButton,
  LoadingIndicator,
} from "@/lib/styles/components";

// Mock data - replace with actual API call
const mockPost: BlogPost = {
  id: "1",
  slug: "ai-legal-research-future",
  title: "The Future of AI in Legal Research: Trends and Innovations",
  excerpt:
    "Exploring how artificial intelligence is revolutionizing legal research and what it means for the future of law practice.",
  content: `# Introduction\n\nArtificial intelligence is transforming the legal industry...`,
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
};

export default function EditPostPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const fetchPost = async (): Promise<void> => {
      try {
        setLoading(true);
        // Simulate API call to fetch post
        // In production, fetch by params.id
        await new Promise((resolve) => setTimeout(resolve, 500));
        setPost(mockPost);
      } catch (error) {
        console.error("Error fetching post:", error);
        toast.error("Failed to load post", {
          description: error instanceof Error ? error.message : "An unexpected error occurred",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [params.id]);

  const handleSave = async (_postData: Partial<BlogPost>): Promise<void> => {
    // TODO: Use postData when implementing API call
    void _postData;
    try {
      // TODO: Implement API call to update post
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      setLastSaved(new Date());
      toast.success("Post updated successfully", {
        description: "Your changes have been saved.",
      });
    } catch (error) {
      console.error("Error saving post:", error);
      toast.error("Failed to save post", {
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  const handlePublish = async (_postData: Partial<BlogPost>): Promise<void> => {
    // TODO: Use postData when implementing API call
    void _postData;
    try {
      // TODO: Implement API call to publish/update post
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      toast.success("Post published successfully", {
        description: "Your post is now live.",
      });
      
      router.push("/blog/admin");
    } catch (error) {
      console.error("Error publishing post:", error);
      toast.error("Failed to publish post", {
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  const handlePreview = (): void => {
    // Open preview in new tab
    if (post) {
      try {
        window.open(`/blog/${post.slug}`, "_blank");
      } catch (error) {
        console.error("Error opening preview:", error);
        toast.error("Failed to open preview", {
          description: "Please check your browser's popup settings.",
        });
      }
    } else {
      toast.error("Cannot preview", {
        description: "Please save your post first before previewing.",
      });
    }
  };

  if (loading) {
    return (
      <PageContainer width="standard" className="py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <LoadingIndicator message="Loading post..." size="lg" variant="centered" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!post) {
    return (
      <PageContainer width="standard" className="py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Post Not Found</h1>
            <SecondaryButton onClick={() => router.push("/blog/admin")} icon={ArrowLeft}>
              Back to Admin
            </SecondaryButton>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="standard" className="py-12">
      {/* Header */}
      <div className="mb-8 sticky top-0 z-10 bg-background pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <IconButton
              icon={ArrowLeft}
              onClick={() => router.push("/blog/admin")}
              variant="muted"
              size="sm"
              aria-label="Back to admin"
            />
            <div>
              <div className="flex items-center gap-3">
                <Header title="Edit Post" size="2xl" />
                <Badge
                  variant="outline"
                  className={
                    post.status === "published"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : post.status === "draft"
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : "bg-blue-100 text-blue-700 border-blue-200"
                  }
                >
                  {post.status}
                </Badge>
              </div>
              {lastSaved && (
                <p className="text-sm text-muted-foreground mt-1">
                  Last saved: {lastSaved.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div>
        <PostEditor
          post={post}
          onSave={handleSave}
          onPublish={handlePublish}
          onPreview={handlePreview}
        />
      </div>
    </PageContainer>
  );
}
