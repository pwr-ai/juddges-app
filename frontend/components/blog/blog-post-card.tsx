"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge } from "@/lib/styles/components";
import { StatusBadge, EditorialCard } from "@/components/editorial";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	Calendar,
	Clock,
	Eye,
	Heart,
	Edit,
	Trash2,
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
		<EditorialCard
			flat
			clickable
			className={cn(
				"group relative overflow-hidden",
				"flex flex-col h-full",
				"p-0 border border-rule hover:border-oxblood transition-colors"
			)}
			onClick={() => router.push(postUrl)}
		>
			{/* Image Container - No text overlay */}
			<Link href={postUrl} className="relative h-64 overflow-hidden rounded-none bg-parchment-deep border-b border-rule">
				{isValidImage && post.featured_image ? (
					<>
						{imageLoading && (
							<div className="absolute inset-0 bg-parchment-deep" />
						)}
						<Image
							src={post.featured_image}
							alt={post.title}
							fill
							className={cn(
								"object-cover transition-opacity duration-300",
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
					<div className="w-full h-full bg-parchment-deep flex items-center justify-center text-ink-soft text-xs font-mono">
						No image
					</div>
				)}

				{/* Status Badge - Floating */}
				<div className="absolute top-3 right-3">
					<StatusBadge status={post.status} />
				</div>

				{/* Admin Action Buttons - Appear on hover */}
				{showActions && (
					<div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
						{onEdit && (
							<button
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onEdit(post.id);
								}}
								aria-label="Edit post"
								className="p-1.5 rounded-none bg-parchment border border-rule text-ink-soft hover:text-ink hover:border-oxblood transition-colors"
							>
								<Edit className="h-4 w-4" />
							</button>
						)}
						{onDelete && (
							<button
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onDelete(post.id);
								}}
								aria-label="Delete post"
								className="p-1.5 rounded-none bg-parchment border border-rule text-ink-soft hover:text-oxblood hover:border-oxblood transition-colors"
							>
								<Trash2 className="h-4 w-4" />
							</button>
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
						className="px-2 py-0.5 text-xs font-mono font-medium bg-parchment-deep text-ink border-rule rounded-none"
					>
						{post.category}
					</Badge>
					{post.tags.slice(0, 2).map((tag, index) => (
						<Badge
							key={index}
							variant="outline"
							className="px-2 py-0.5 text-xs font-mono font-medium bg-parchment text-ink-soft border-rule rounded-none"
						>
							#{tag}
						</Badge>
					))}
					{post.tags.length > 2 && (
						<Badge
							variant="outline"
							className="px-2 py-0.5 text-xs font-mono font-medium bg-parchment-deep text-ink-soft border-rule rounded-none"
						>
							+{post.tags.length - 2}
						</Badge>
					)}
				</div>

				{/* Title */}
				<Link href={postUrl}>
					<h3
						className={cn(
							"font-serif text-lg font-bold text-ink mb-2",
							"line-clamp-2 leading-snug",
							"group-hover:text-oxblood transition-colors"
						)}
					>
						{post.title}
					</h3>
				</Link>

				{/* Excerpt */}
				<p className="text-ink-soft text-sm mb-4 line-clamp-2 leading-relaxed flex-1">
					{post.excerpt}
				</p>

				{/* AI Summary - if available */}
				{post.ai_summary && (
					<div className="mb-4 p-3 border border-rule bg-parchment-deep rounded-none">
						<p className="text-xs font-mono font-medium text-ink mb-1.5">
							AI Insight
						</p>
						<p className="text-xs font-mono text-ink-soft line-clamp-2">
							{post.ai_summary}
						</p>
					</div>
				)}

				{/* Meta Footer */}
				<div className="flex items-center justify-between text-xs font-mono text-ink-soft pt-4 border-t border-rule">
					<div className="flex items-center gap-4">
						<span className="flex items-center gap-1">
							<Calendar className="size-3.5" />
							{formatDate(post.published_at || post.created_at)}
						</span>
						{post.read_time && (
							<span className="flex items-center gap-1">
								<Clock className="size-3.5" />
								{post.read_time} min
							</span>
						)}
					</div>
					{post.author && (
						<span className="font-medium text-ink truncate max-w-[120px]">
							{post.author.name}
						</span>
					)}
				</div>

				{/* Engagement Stats */}
				{(post.views !== undefined || post.likes !== undefined) && (
					<div className="flex items-center gap-4 mt-3 pt-3 border-t border-rule text-xs font-mono text-ink-soft">
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
				<Button
					variant="outline"
					size="sm"
					className="rounded-none border-rule bg-parchment text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						router.push(postUrl);
					}}
				>
					Read More
					<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
				</Button>
			</div>
		</EditorialCard>
	);
}
