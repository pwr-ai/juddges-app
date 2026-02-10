"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PostEditor } from "@/components/blog/admin/post-editor";
import { ArrowLeft } from "lucide-react";
import type { BlogPost } from "@/types/blog";
import { toast } from "sonner";
import {
  PageContainer,
  Header,
  IconButton,
} from "@/lib/styles/components";

export default function NewPostPage(): React.JSX.Element {
  const router = useRouter();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleSave = async (_postData: Partial<BlogPost>): Promise<void> => {
    // TODO: Use postData when implementing API call
    void _postData;
    try {
      // TODO: Implement API call to save draft
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      setLastSaved(new Date());
      toast.success("Draft saved successfully", {
        description: "Your draft has been saved.",
      });
    } catch (error) {
      console.error("Error saving draft:", error);
      toast.error("Failed to save draft", {
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  const handlePublish = async (postData: Partial<BlogPost>): Promise<void> => {
    try {
      // Validate required fields
      if (!postData.title || !postData.excerpt || !postData.content) {
        toast.error("Missing required fields", {
          description: "Please fill in title, excerpt, and content before publishing.",
        });
        return;
      }

      // TODO: Implement API call to publish post
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
    // Preview is handled by PostEditor component for new posts
    // This callback is not used for new posts, but kept for consistency
  };

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
              <Header title="Create New Post" size="2xl" />
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
          onSave={handleSave}
          onPublish={handlePublish}
          onPreview={handlePreview}
        />
      </div>
    </PageContainer>
  );
}
