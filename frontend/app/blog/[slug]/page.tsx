import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Clock, Eye, User } from "lucide-react";
import { cache } from "react";

import { BlogPostCard } from "@/components/blog/blog-post-card";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import {
  EditorialCard,
  Eyebrow,
  Headline,
  PaperBackground,
  Rule,
} from "@/components/editorial";
import {
  loadPublicBlogPost,
  type PublicBlogPost,
} from "@/lib/blog/public-api";
import type { BlogPost } from "@/types/blog";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

// Next invokes metadata and the page within one server request. React cache
// keeps both consumers on the same validated upstream snapshot while the
// underlying backend fetch remains explicitly no-store.
const getPublicBlogPost = cache(loadPublicBlogPost);

function formatDate(value?: string | null): string {
  if (!value) return "Publication date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publication date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function toBlogPost(post: PublicBlogPost): BlogPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content ?? undefined,
    featured_image: post.featured_image ?? undefined,
    author: {
      name: post.author.name,
      avatar: post.author.avatar ?? undefined,
      title: post.author.title,
    },
    status: "published",
    published_at: post.published_at ?? undefined,
    created_at: post.created_at,
    updated_at: post.updated_at,
    tags: post.tags,
    category: post.category,
    read_time: post.read_time ?? undefined,
    views: post.views,
    likes: post.likes_count,
    ai_summary: post.ai_summary ?? undefined,
  };
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicBlogPost(slug);
  if (!post) return { title: "Article not found" };

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      images: post.featured_image ? [post.featured_image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPublicBlogPost(slug);
  if (!post) notFound();

  return (
    <PaperBackground grain className="min-h-screen py-12 md:py-16">
      <article className="mx-auto w-full max-w-5xl px-5 md:px-8">
        <Link
          href="/blog"
          className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)] hover:text-[var(--oxblood)]"
        >
          ← Back to the journal
        </Link>

        <header className="mt-10">
          <Eyebrow>{post.category}</Eyebrow>
          <Headline as="h1" size="lg" className="mt-5 max-w-4xl">
            {post.title}
          </Headline>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--ink-soft)]">
            {post.excerpt}
          </p>

          <Rule className="my-8" />
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-[var(--ink-soft)]">
            <span className="flex items-center gap-2">
              <User aria-hidden="true" className="size-4" />
              {post.author.name}
              {post.author.title ? ` · ${post.author.title}` : ""}
            </span>
            <span className="flex items-center gap-2">
              <Calendar aria-hidden="true" className="size-4" />
              {formatDate(post.published_at)}
            </span>
            {post.read_time ? (
              <span className="flex items-center gap-2">
                <Clock aria-hidden="true" className="size-4" />
                {post.read_time} min read
              </span>
            ) : null}
            <span className="flex items-center gap-2">
              <Eye aria-hidden="true" className="size-4" />
              {post.views.toLocaleString("en-GB")} views
            </span>
          </div>
        </header>

        {post.featured_image ? (
          <div className="relative mt-10 aspect-[2/1] overflow-hidden border border-[var(--rule)]">
            <Image
              src={post.featured_image}
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 960px"
              className="object-cover"
            />
          </div>
        ) : null}

        {post.ai_summary ? (
          <EditorialCard eyebrow="Research note" title="Article summary" className="mt-10">
            <p className="leading-7 text-[var(--ink-soft)]">{post.ai_summary}</p>
          </EditorialCard>
        ) : null}

        <div className="mt-12 border-y border-[var(--rule)] bg-[var(--parchment)] px-5 py-8 md:px-10 md:py-12">
          <MarkdownRenderer content={post.content ?? ""} />
          {post.tags.length ? (
            <footer className="mt-12 flex flex-wrap gap-3 border-t border-[var(--rule)] pt-6">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-xs uppercase tracking-wider text-[var(--oxblood)]"
                >
                  #{tag}
                </span>
              ))}
            </footer>
          ) : null}
        </div>

        {post.related_posts.length ? (
          <section aria-labelledby="related-posts" className="mt-16">
            <Eyebrow>Further reading</Eyebrow>
            <Headline as="h2" size="sm" id="related-posts" className="mt-4">
              Related articles
            </Headline>
            <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {post.related_posts.map((related) => (
                <BlogPostCard key={related.id} post={toBlogPost(related)} />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </PaperBackground>
  );
}
