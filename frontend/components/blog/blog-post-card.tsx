"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge, IconButton, SecondaryButton, LightCard } from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Clock,
  Eye,
  Heart,
  Edit,
  Trash2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { BlogPost } from "@/types/blog";

interface BlogPostCardProps {
  post: BlogPost;
  showActions?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "No date";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "Invalid date";
  }
}

const statusColors = {
  published: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
  draft: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
  scheduled: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
} as const;

export function BlogPostCard({
  post,
  showActions = false,
  onEdit,
  onDelete,
}: BlogPostCardProps): React.JSX.Element {
  const router = useRouter();
  const postUrl = `/blog/${post.slug}`;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  // Check if image URL is valid (not a placeholder and no error occurred)
  const isValidImage = post.featured_image && 
    !post.featured_image.startsWith("/api/placeholder") &&
    !imageError;

  return (
    <LightCard
      showBorder={true}
      showShadow={false}
      className={cn(
        "group relative overflow-hidden",
        "flex flex-col h-full",
        "hover:shadow-xl transition-all duration-300 hover:-translate-y-1",
        "p-0"
      )}
      onClick={() => router.push(postUrl)}
    >
      {/* Image Container - No text overlay */}
      <Link href={postUrl} className="relative h-64 overflow-hidden rounded-t-xl bg-muted">
        {isValidImage && post.featured_image ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 flex items-center justify-center">
                <Sparkles className="size-16 text-primary/30 animate-pulse" />
              </div>
            )}
            <Image
              src={post.featured_image}
              alt={post.title}
              fill
              className={cn(
                "object-cover group-hover:scale-105 transition-transform duration-500",
                imageLoading && "opacity-0"
              )}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              onLoad={() => setImageLoading(false)}
              unoptimized={!post.featured_image.includes("images.unsplash.com")}
            />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 flex items-center justify-center">
            <Sparkles className="size-16 text-primary/30" />
          </div>
        )}

        {/* Status Badge - Floating */}
        <div className="absolute top-4 right-4">
          <Badge
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-full backdrop-blur-sm shadow-lg border capitalize",
              statusColors[post.status]
            )}
          >
            {post.status}
          </Badge>
        </div>

        {/* Admin Action Buttons - Appear on hover */}
        {showActions && (
          <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <IconButton
                icon={Edit}
                onClick={(e) => {
                  e?.preventDefault();
                  onEdit(post.id);
                }}
                aria-label="Edit post"
                variant="muted"
                size="sm"
                className="bg-background/90 dark:bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
              />
            )}
            {onDelete && (
              <IconButton
                icon={Trash2}
                onClick={(e) => {
                  e?.preventDefault();
                  onDelete(post.id);
                }}
                aria-label="Delete post"
                variant="muted"
                size="sm"
                className="bg-background/90 dark:bg-background/90 backdrop-blur-sm hover:bg-background hover:text-destructive shadow-lg"
              />
            )}
          </div>
        )}
      </Link>

      {/* Content Section */}
      <div className="flex-1 flex flex-col p-6">
        {/* Category & Tags */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge
            variant="outline"
            className="px-2 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50"
          >
            {post.category}
          </Badge>
          {post.tags.slice(0, 2).map((tag, index) => (
            <Badge
              key={index}
              variant="outline"
              className="px-2 py-1 text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50"
            >
              #{tag}
            </Badge>
          ))}
          {post.tags.length > 2 && (
            <Badge
              variant="outline"
              className="px-2 py-1 text-xs font-medium bg-muted text-muted-foreground border-border"
            >
              +{post.tags.length - 2}
            </Badge>
          )}
        </div>

        {/* Title */}
        <Link href={postUrl}>
          <h3
            className={cn(
              "text-xl font-bold text-foreground mb-2",
              "line-clamp-2 leading-snug",
              "group-hover:text-primary transition-colors"
            )}
          >
            {post.title}
          </h3>
        </Link>

        {/* Excerpt */}
        <p className="text-muted-foreground text-sm mb-4 line-clamp-2 leading-relaxed flex-1">
          {post.excerpt}
        </p>

        {/* AI Summary - if available */}
        {post.ai_summary && (
          <div className="mb-4 p-3 rounded-lg bg-accent/50 dark:bg-accent/30 border border-accent dark:border-accent/50">
            <p className="text-xs font-medium text-accent-foreground mb-1.5 flex items-center gap-1.5">
              <Sparkles className="size-3" />
              AI Insight
            </p>
            <p className="text-xs text-foreground/90 line-clamp-2">
              {post.ai_summary}
            </p>
          </div>
        )}

        {/* Meta Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t border-border">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-xs">
              <Calendar className="size-3.5" />
              {formatDate(post.published_at || post.created_at)}
            </span>
            {post.read_time && (
              <span className="flex items-center gap-1 text-xs">
                <Clock className="size-3.5" />
                {post.read_time} min
              </span>
            )}
          </div>
          {post.author && (
            <span className="font-medium text-foreground/80 text-xs truncate max-w-[120px]">
              {post.author.name}
            </span>
          )}
        </div>

        {/* Engagement Stats */}
        {(post.views || post.likes) && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            {post.views !== undefined && (
              <span className="flex items-center gap-1">
                <Eye className="size-3.5" />
                {post.views.toLocaleString()}
              </span>
            )}
            {post.likes !== undefined && (
              <span className="flex items-center gap-1">
                <Heart className="size-3.5" />
                {post.likes}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover CTA */}
      <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <SecondaryButton
          size="sm"
          icon={ArrowRight}
          className="shadow-lg hover:shadow-xl"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(postUrl);
          }}
        >
          Read More
        </SecondaryButton>
      </div>
    </LightCard>
  );
}
