"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Badge, SecondaryButton, PrimaryButton, LightCard, PageContainer, IconButton, Header } from "@/lib/styles/components";
import { BlogPostCard } from "@/components/blog/blog-post-card";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import {
  GraduationCap,
  Calendar,
  Clock,
  Eye,
  Heart,
  Share2,
  Bookmark,
  Download,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  User,
  Twitter,
  Linkedin,
  Link2,
  Check,
  Edit,
} from "lucide-react";
import type { BlogPost } from "@/types/blog";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// Mock data - replace with actual API call
const mockPost: BlogPost = {
  id: "1",
  slug: "ai-legal-research-future",
  title: "The Future of AI in Legal Research: Trends and Innovations",
  excerpt:
    "Exploring how artificial intelligence is revolutionizing legal research and what it means for the future of law practice.",
  content: `
# Introduction

Artificial intelligence is transforming the legal industry at an unprecedented pace. From document analysis to predictive analytics, AI-powered tools are changing how legal professionals conduct research and make decisions.

## The Current State of AI in Legal Research

Over the past decade, we've seen remarkable advances in natural language processing and machine learning. These technologies have enabled the development of sophisticated legal research platforms that can:

- Analyze thousands of documents in seconds
- Identify relevant case law with high precision
- Extract key information from complex legal texts
- Predict case outcomes based on historical data

### Natural Language Processing

Natural language processing (NLP) has become the backbone of modern legal AI systems. By understanding the nuances of legal language, these systems can:

1. **Semantic Search**: Find relevant documents based on meaning, not just keywords
2. **Citation Analysis**: Trace the evolution of legal arguments through case history
3. **Entity Recognition**: Automatically identify parties, dates, and legal concepts

Here's an example of how you might use a legal AI API in Python:

\`\`\`python
from legal_ai import LegalResearchClient

# Initialize the client
client = LegalResearchClient(api_key="your_api_key")

# Perform semantic search
results = client.search(
    query="precedents on contract interpretation",
    jurisdiction="federal",
    date_range={"start": "2020-01-01", "end": "2024-12-31"}
)

# Analyze results
for case in results:
    print(f"Case: {case.name}")
    print(f"Relevance: {case.relevance_score}")
    print(f"Summary: {case.ai_summary}")
\`\`\`

You can also use TypeScript for web applications:

\`\`\`typescript
interface CaseResult {
  name: string;
  relevanceScore: number;
  aiSummary: string;
  citedBy: string[];
}

async function searchLegalCases(query: string): Promise<CaseResult[]> {
  const response = await fetch('/api/legal-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  return response.json();
}
\`\`\`

## Emerging Trends

### 1. Predictive Analytics

Courts and law firms are increasingly using AI to predict case outcomes. By analyzing historical data, these systems can provide insights into:

- Settlement probabilities
- Likely judicial decisions
- Timeline estimates

### 2. Automated Document Review

AI-powered document review is saving thousands of hours in discovery and due diligence processes. Modern systems can:

- Classify documents by relevance
- Identify privileged communications
- Flag potential risks or compliance issues

### 3. Legal Research Assistants

The next generation of legal AI goes beyond search to become true research assistants. These systems can:

- Generate research memos
- Suggest relevant precedents
- Draft legal arguments

## Challenges and Considerations

While AI offers tremendous benefits, there are important considerations:

### Ethical Concerns

- **Bias in algorithms**: AI systems may perpetuate existing biases in legal data
- **Transparency**: The "black box" problem makes it difficult to explain AI decisions
- **Accountability**: Questions about who is responsible when AI makes errors

> **Important Note**: When implementing AI systems in legal contexts, it's crucial to maintain human oversight and ensure that AI serves as a tool to assist, not replace, professional judgment.

### Data Privacy

Legal AI systems require access to sensitive data, raising important privacy questions:

- How is data stored and protected?
- Who has access to training data?
- What are the implications for attorney-client privilege?

Here's a simple SQL query to retrieve anonymized case data:

\`\`\`sql
SELECT
  case_id,
  jurisdiction,
  decision_date,
  outcome,
  ai_analysis_score
FROM legal_cases
WHERE privacy_status = 'anonymized'
  AND decision_date >= '2020-01-01'
ORDER BY decision_date DESC
LIMIT 100;
\`\`\`

You can also configure your analysis pipeline using JSON:

\`\`\`json
{
  "pipeline": {
    "stages": [
      {
        "name": "document_ingestion",
        "enabled": true,
        "options": {
          "formats": ["pdf", "docx", "txt"],
          "ocr_enabled": true
        }
      },
      {
        "name": "entity_extraction",
        "enabled": true,
        "entities": ["person", "organization", "date", "legal_citation"]
      },
      {
        "name": "sentiment_analysis",
        "enabled": false
      }
    ]
  }
}
\`\`\`

## The Road Ahead

The future of AI in legal research is bright, but it requires careful navigation. Key developments to watch:

1. **Explainable AI**: Systems that can explain their reasoning
2. **Specialized Models**: AI trained on specific areas of law
3. **Integration**: Seamless incorporation into existing workflows
4. **Regulation**: Government oversight and professional standards

### Comparison of AI Legal Research Platforms

| Platform | Semantic Search | Citation Analysis | Predictive Analytics | Price Range |
|----------|-----------------|-------------------|----------------------|-------------|
| LegalAI Pro | Yes | Advanced | Yes | $$$$ |
| CaseSearch Plus | Yes | Basic | No | $$$ |
| DocAnalyzer | Limited | Advanced | Limited | $$ |
| OpenLegal | Yes | Basic | No | Free |

For more information, check out the [official documentation](https://docs.example.com) or visit our [GitHub repository](https://github.com/example/legal-ai).

When using these platforms, remember to use the \`--secure\` flag for sensitive data and always verify results with the \`verify_citations()\` function.

## Conclusion

AI is not replacing lawyers—it's empowering them. By automating routine tasks and providing powerful insights, AI allows legal professionals to focus on what they do best: strategic thinking, creative problem-solving, and client service.

The question is no longer **whether** to adopt AI in legal research, but *how* to do so responsibly and effectively.

---

*This research is part of the ongoing AI in Law project at Wrocław University of Science and Technology.*
  `,
  featured_image: "/api/placeholder/1200/600",
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
    "This article discusses the transformative impact of AI on legal research, highlighting key trends such as natural language processing, predictive analytics, and automated document review. It also addresses ethical concerns and data privacy considerations.",
};

const relatedPosts: BlogPost[] = [
  {
    id: "2",
    slug: "understanding-tax-interpretations",
    title: "Understanding Polish Tax Interpretations",
    excerpt: "A comprehensive guide to navigating tax interpretations.",
    author: { 
      name: "Anna Kowalska", 
      title: "Tax Law Expert",
      avatar: "/api/placeholder/100/100"
    },
    status: "published",
    published_at: "2025-01-05T14:30:00Z",
    created_at: "2025-01-03T10:00:00Z",
    updated_at: "2025-01-05T14:30:00Z",
    tags: ["Tax", "Legal"],
    category: "Tutorials",
    read_time: 12,
    views: 2341,
    likes: 156,
  },
  {
    id: "3",
    slug: "new-document-analysis-features",
    title: "Introducing Advanced Document Analysis Features",
    excerpt: "New AI-powered document analysis features.",
    featured_image: "/api/placeholder/800/600",
    author: { 
      name: "System Admin", 
      title: "Product Team",
      avatar: "/api/placeholder/100/100"
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
];

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "No date";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return "Invalid date";
  }
}

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        setLoading(true);
        // Simulate API call
        // In production, fetch by params.slug
        await new Promise((resolve) => setTimeout(resolve, 500));
        setPost(mockPost);
      } catch (error) {
        console.error("Error fetching post:", error);
        toast.error("Failed to load post", {
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [params.slug]);

  useEffect(() => {
    // Check if user is logged in with Supabase
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error checking auth:', error);
          setIsLoggedIn(false);
          return;
        }
        setIsLoggedIn(!!session);
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsLoggedIn(false);
      }
    };
    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setIsLoggedIn(!!session);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleShare = async (platform: "twitter" | "linkedin" | "copy") => {
    try {
      const url = window.location.href;
      const title = post?.title || "";

      switch (platform) {
        case "twitter":
          window.open(
            `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
            "_blank"
          );
          break;
        case "linkedin":
          window.open(
            `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
            "_blank"
          );
          break;
        case "copy":
          await navigator.clipboard.writeText(url);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
          toast.success("Link copied to clipboard");
          break;
      }
    } catch (error) {
      console.error("Error sharing:", error);
      toast.error("Failed to share", {
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  };

  if (loading) {
    return (
      <PageContainer width="standard" className="py-12">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Sparkles className="size-12 text-primary animate-pulse mx-auto mb-4" />
            <p className="text-muted-foreground">Loading post...</p>
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
            <SecondaryButton onClick={() => router.push("/blog")} icon={ArrowLeft}>
              Back to Blog
            </SecondaryButton>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero Section */}
      <div className="mb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link
            href="/blog"
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="size-3.5" />
            Back to Blog
          </Link>
        </div>

        {/* Category Badge */}
        <div className="mb-6">
          <Badge className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 border-blue-200">
            {post.category}
          </Badge>
        </div>

        {/* Title */}
        <Header
          title={post.title}
          size="4xl"
          description={post.excerpt}
        />

        {/* Author & Meta */}
        <div className="flex flex-wrap items-center gap-6 mb-6">
          {/* Author */}
          <div className="flex items-center gap-3">
            {post.author.avatar && !post.author.avatar.startsWith("/api/placeholder") ? (
              <Image
                src={post.author.avatar}
                alt={post.author.name}
                width={48}
                height={48}
                className="rounded-full"
                unoptimized={!post.author.avatar.includes("images.unsplash.com")}
              />
            ) : (
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="size-6 text-primary" />
              </div>
            )}
            <div>
              <div className="font-semibold">{post.author.name}</div>
              <div className="text-sm text-muted-foreground">
                {post.author.title}
              </div>
            </div>
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-4" />
              {formatDate(post.published_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              {post.read_time} min read
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="size-4" />
              {post.views?.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {isLoggedIn && (
            <PrimaryButton
              onClick={() => router.push(`/blog/admin/${post.id}`)}
              icon={Edit}
            >
              Edit Post
            </PrimaryButton>
          )}
          <SecondaryButton
            onClick={() => setIsLiked(!isLiked)}
            icon={Heart}
            className={cn(isLiked && "bg-primary text-primary-foreground")}
          >
            {post.likes}
          </SecondaryButton>
          <SecondaryButton
            onClick={() => setIsBookmarked(!isBookmarked)}
            icon={Bookmark}
            className={cn(isBookmarked && "bg-primary text-primary-foreground")}
          >
            Save
          </SecondaryButton>
          <DropdownShare onShare={handleShare} copySuccess={copySuccess} />
        </div>
      </div>

      {/* Featured Image */}
      {post.featured_image && !post.featured_image.startsWith("/api/placeholder") && (
        <div className="mb-8">
          <div className="relative aspect-video rounded-xl overflow-hidden">
            <Image
              src={post.featured_image}
              alt={post.title}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
              unoptimized={!post.featured_image.includes("images.unsplash.com")}
            />
          </div>
        </div>
      )}

      {/* AI Summary - Sticky at top */}
      {post.ai_summary && (
        <div className="sticky top-4 z-20 mb-8">
          <LightCard padding="md" className="bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/50 shadow-lg">
            <p className="text-sm font-semibold text-accent-foreground mb-3 flex items-center gap-2">
              <Sparkles className="size-4" />
              AI-Generated Summary
            </p>
            <p className="text-base leading-relaxed text-foreground">{post.ai_summary}</p>
          </LightCard>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">
        {/* Article Content */}
        <LightCard padding="lg">

          {/* Content */}
          <MarkdownRenderer content={post.content || ""} />

          {/* Tags */}
          <div className="mt-12 pt-8 border-t border-border">
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="px-3 py-1 text-sm hover:bg-accent transition-colors cursor-pointer"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Share Section */}
          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-sm font-semibold mb-4">Share this article</p>
            <div className="flex gap-2">
              <IconButton
                onClick={() => handleShare("twitter")}
                icon={Twitter}
                aria-label="Share on Twitter"
              />
              <IconButton
                onClick={() => handleShare("linkedin")}
                icon={Linkedin}
                aria-label="Share on LinkedIn"
              />
              <IconButton
                onClick={() => handleShare("copy")}
                icon={copySuccess ? Check : Link2}
                aria-label="Copy link"
                className={cn(copySuccess && "text-green-600")}
              />
            </div>
          </div>
        </LightCard>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Author Card */}
          <LightCard padding="md">
            <p className="text-sm font-semibold mb-4">About the Author</p>
            <div className="flex items-start gap-3">
              {post.author.avatar && !post.author.avatar.startsWith("/api/placeholder") ? (
                <Image
                  src={post.author.avatar}
                  alt={post.author.name}
                  width={60}
                  height={60}
                  className="rounded-full"
                  unoptimized={!post.author.avatar.includes("images.unsplash.com")}
                />
              ) : (
                <div className="size-15 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="size-8 text-primary" />
                </div>
              )}
              <div className="flex-1">
                <div className="font-semibold mb-1">{post.author.name}</div>
                <div className="text-sm text-muted-foreground mb-3">
                  {post.author.title}
                </div>
                <SecondaryButton size="sm" className="w-full">
                  View Profile
                </SecondaryButton>
              </div>
            </div>
          </LightCard>

          {/* University Badge */}
          <LightCard padding="md">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GraduationCap className="size-5 text-primary" />
              </div>
              <div className="text-sm font-semibold">Research Project</div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This article is part of research conducted at Wrocław
              University of Science and Technology.
            </p>
          </LightCard>

          {/* Quick Actions */}
          <LightCard padding="md">
            <p className="text-sm font-semibold mb-4">Quick Actions</p>
            <div className="space-y-2">
              <SecondaryButton size="sm" className="w-full" icon={Download}>
                Export as PDF
              </SecondaryButton>
              <SecondaryButton size="sm" className="w-full" icon={Share2}>
                Share
              </SecondaryButton>
            </div>
          </LightCard>
        </aside>
      </div>

      {/* Related Posts */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold mb-8">Related Articles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {relatedPosts.map((relatedPost) => (
            <BlogPostCard key={relatedPost.id} post={relatedPost} />
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <LightCard padding="lg" className="mt-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Enjoyed this article?</h2>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
          Explore more research insights and stay updated with the latest in
          legal AI technology.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <PrimaryButton size="lg" icon={ArrowRight} onClick={() => router.push("/blog")}>
            View All Articles
          </PrimaryButton>
          <SecondaryButton size="lg" onClick={() => router.push("/chat")}>
            Ask AI Assistant
          </SecondaryButton>
        </div>
      </LightCard>
    </PageContainer>
  );
}

// Share dropdown component
function DropdownShare({
  onShare,
  copySuccess,
}: {
  onShare: (platform: "twitter" | "linkedin" | "copy") => void | Promise<void>;
  copySuccess: boolean;
}) {
  return (
    <SecondaryButton 
      onClick={() => {
        const result = onShare("copy");
        // Handle promise if async
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error("Error in share handler:", error);
          });
        }
      }} 
      icon={Share2}
    >
      {copySuccess ? "Copied!" : "Share"}
    </SecondaryButton>
  );
}
