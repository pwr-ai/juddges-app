"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TiptapEditor } from "./tiptap-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  LightCard,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  Badge,
} from "@/lib/styles/components";
import {
  Sparkles,
  Image as ImageIcon,
  Upload,
  X,
  Wand2,
  Tag,
  Eye,
  Save,
  Send,
} from "lucide-react";
import type { BlogPost } from "@/types/blog";

interface PostEditorProps {
  post?: BlogPost;
  onSave: (post: Partial<BlogPost>) => Promise<void> | void;
  onPublish?: (post: Partial<BlogPost>) => Promise<void> | void;
  onPreview?: () => void;
}

const categories = [
  "Research",
  "Tutorials",
  "Updates",
  "Insights",
  "News",
  "Case Studies",
];

export function PostEditor({
  post,
  onSave,
  onPublish,
  onPreview,
}: PostEditorProps): React.JSX.Element {
  const [title, setTitle] = useState(post?.title || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [content, setContent] = useState(post?.content || "");
  const [category, setCategory] = useState(post?.category || "Research");
  const [tags, setTags] = useState<string[]>(post?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [featuredImage, setFeaturedImage] = useState(post?.featured_image || "");
  const [isFeatured, setIsFeatured] = useState(false);
  const [publishDate, setPublishDate] = useState("");
  const [aiSummary, setAiSummary] = useState(post?.ai_summary || "");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleAddTag = (): void => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string): void => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleGenerateSummary = async (): Promise<void> => {
    setIsGeneratingSummary(true);
    // Simulate AI summary generation
    setTimeout(() => {
      const mockSummary =
        "This article explores " +
        title.toLowerCase() +
        " with insights into key trends and practical applications.";
      setAiSummary(mockSummary);
      setIsGeneratingSummary(false);
    }, 2000);
  };

  const handleGenerateTags = async (): Promise<void> => {
    // Simulate AI tag generation
    const mockTags = ["AI", "Legal Tech", "Innovation"];
    setTags([...new Set([...tags, ...mockTags])]);
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      const postData: Partial<BlogPost> = {
        title,
        excerpt,
        content,
        category,
        tags,
        featured_image: featuredImage,
        ai_summary: aiSummary,
      };
      await onSave(postData);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    if (onPublish) {
      setIsSaving(true);
      try {
        const postData: Partial<BlogPost> = {
          title,
          excerpt,
          content,
          category,
          tags,
          featured_image: featuredImage,
          ai_summary: aiSummary,
          status: "published",
        };
        await onPublish(postData);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
      {/* Main Editor */}
      <div className="space-y-6">
        {/* Title */}
        <LightCard padding="lg">
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Post Content</h3>
            <p className="text-sm text-muted-foreground">
              Write your blog post content here. Use Markdown for formatting.
            </p>
          </div>
          <div className="space-y-6">
            {/* Title Input */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Enter post title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/60 characters (optimal length)
              </p>
            </div>

            {/* Excerpt */}
            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt *</Label>
              <Textarea
                id="excerpt"
                placeholder="Write a brief summary of your post..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {excerpt.length}/160 characters (optimal length)
              </p>
            </div>

              {/* Content Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">Content *</Label>
                <SecondaryButton
                  size="sm"
                  icon={Wand2}
                  onClick={() => {}}
                >
                  AI Assist
                </SecondaryButton>
              </div>
              <TiptapEditor
                content={content}
                onChange={setContent}
                placeholder="Start writing your blog post..."
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {content.replace(/<[^>]*>/g, '').split(" ").length} words ≈{" "}
                  {Math.ceil(content.replace(/<[^>]*>/g, '').split(" ").length / 200)} min read
                </span>
                <span>Rich text editor with formatting tools</span>
              </div>
            </div>
          </div>
        </LightCard>

        {/* Featured Image */}
        <LightCard padding="lg">
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Featured Image</h3>
            <p className="text-sm text-muted-foreground">
              Upload a featured image for your post (1200x600px recommended)
            </p>
          </div>
          <div>
            {featuredImage ? (
              <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featuredImage}
                  alt="Featured"
                  className="w-full h-full object-cover"
                />
                <IconButton
                  icon={X}
                  onClick={() => setFeaturedImage("")}
                  variant="error"
                  size="sm"
                  className="absolute top-2 right-2"
                  aria-label="Remove image"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer">
                <ImageIcon className="size-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop an image or click to browse
                </p>
                <SecondaryButton size="sm" icon={Upload}>
                  Upload Image
                </SecondaryButton>
              </div>
            )}
          </div>
        </LightCard>

        {/* AI Summary */}
        <LightCard padding="lg">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  AI-Generated Summary
                </h3>
                <p className="text-sm text-muted-foreground">
                  Let AI create a compelling summary of your post
                </p>
              </div>
              <SecondaryButton
                size="sm"
                icon={isGeneratingSummary ? Sparkles : Wand2}
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary || !content}
              >
                {isGeneratingSummary ? "Generating..." : "Generate"}
              </SecondaryButton>
            </div>
          </div>
          <div>
            <Textarea
              placeholder="AI summary will appear here..."
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </LightCard>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Publish Settings */}
        <LightCard padding="md">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Publish</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="featured">Featured Post</Label>
              <Switch
                id="featured"
                checked={isFeatured}
                onCheckedChange={setIsFeatured}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="publish-date">Publish Date</Label>
              <Input
                id="publish-date"
                type="datetime-local"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <PrimaryButton
                className="w-full"
                icon={Send}
                onClick={handlePublish}
                disabled={!title || !excerpt || !content || isSaving}
              >
                Publish Now
              </PrimaryButton>
              <SecondaryButton
                className="w-full"
                icon={Save}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </SecondaryButton>
              <SecondaryButton
                className="w-full"
                icon={Eye}
                onClick={() => {
                  if (post && onPreview) {
                    // For existing posts, use the callback to open in new tab
                    onPreview();
                  } else {
                    // For new posts, show preview modal
                    setIsPreviewOpen(true);
                  }
                }}
              >
                Preview
              </SecondaryButton>
            </div>
          </div>
        </LightCard>

        {/* Category */}
        <LightCard padding="md">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Category</h3>
          </div>
          <div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </LightCard>

        {/* Tags */}
        <LightCard padding="md">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Tags</h3>
              <SecondaryButton
                size="sm"
                icon={Sparkles}
                onClick={handleGenerateTags}
              >
                AI Suggest
              </SecondaryButton>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <IconButton
                icon={Tag}
                onClick={handleAddTag}
                size="sm"
                aria-label="Add tag"
              />
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1 pr-1 pl-3"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </LightCard>

        {/* SEO Preview */}
        <LightCard padding="md">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">SEO Preview</h3>
            <p className="text-sm text-muted-foreground">
              How your post will appear in search results
            </p>
          </div>
          <div>
            <div className="space-y-2">
              <div className="text-sm text-blue-600 line-clamp-1">
                {title || "Your Post Title Here"}
              </div>
              <div className="text-xs text-gray-600 line-clamp-2">
                {excerpt || "Your post excerpt will appear here..."}
              </div>
            </div>
          </div>
        </LightCard>

        {/* Post Stats (for edit mode) */}
        {post && (
          <LightCard padding="md">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Statistics</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Views</span>
                <span className="font-semibold">
                  {post.views?.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Likes</span>
                <span className="font-semibold">{post.likes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-semibold">
                  {new Date(post.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </LightCard>
        )}
      </div>

      {/* Preview Modal for New Posts */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Preview Header */}
            <div>
              <div className="mb-4">
                <Badge className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 border-blue-200">
                  {category}
                </Badge>
              </div>
              <h1 className="text-4xl font-bold mb-4">{title || "Untitled Post"}</h1>
              {excerpt && (
                <p className="text-xl text-muted-foreground mb-6">{excerpt}</p>
              )}
            </div>

            {/* Featured Image Preview */}
            {featuredImage && !featuredImage.startsWith("/api/placeholder") && (
              <div className="relative aspect-video rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featuredImage}
                  alt={title || "Featured image"}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <LightCard padding="md" className="bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/50">
                <p className="text-sm font-semibold text-accent-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="size-4" />
                  AI-Generated Summary
                </p>
                <p className="text-base leading-relaxed text-foreground">{aiSummary}</p>
              </LightCard>
            )}

            {/* Content Preview */}
            <LightCard padding="lg">
              {content ? (
                <MarkdownRenderer content={content} />
              ) : (
                <p className="text-muted-foreground italic">No content yet. Start writing to see a preview.</p>
              )}
            </LightCard>

            {/* Tags Preview */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="px-3 py-1 text-sm"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
