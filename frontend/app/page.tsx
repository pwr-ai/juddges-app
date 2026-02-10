"use client";

import Link from "next/link";
import { SkeletonStat, SkeletonCard, SkeletonQuickAction, SkeletonTrendingTopic, SkeletonInsight, SkeletonChatCard, SkeletonDocumentCard, SkeletonExtractionCard } from "@/components/ui/skeleton-card";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { ConversionCTA } from "@/components/auth/ConversionCTA";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDashboardStats,
  useRecentDocuments,
  useTrendingTopics,
  useRecentChats,
  useUserSchemas,
  useCollectionsDocumentCount,
  useRecentExtractions,
} from "@/lib/api/dashboard";
import {
  MessageSquare,
  Search,
  FolderOpen,
  FileText,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart,
  GraduationCap,
  Sparkles,
  ArrowRight,
  Clock,
  ChevronRight,
  Database,
  Zap,
  FileJson,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Header, 
  SecondaryHeader,
  SectionHeader,
  BaseCard, 
  LightCard,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  DocumentCard,
  PageContainer,
  SchemaStatusBadge,
  VerifiedBadge,
} from "@/lib/styles/components";
import { StatsHero } from "@/components/dashboard/stats-hero";
import { StatsCardV1 } from "@/components/dashboard/stats-card-v1";
import { Badge } from "@/components/ui/badge";
import { formatStatNumber } from "@/lib/format-stats";
import { gradients } from "@/lib/styles/colors/gradients";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import React from "react";

function formatLastUpdated(dateString: string | null): { value: string; label: string } {
  if (!dateString) {
    // Temporary fix: return current date if no data
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return { value: `${day}/${month}/${year}`, label: "Last Updated" };
  }

  const date = new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    // Temporary fix: return current date if invalid
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return { value: `${day}/${month}/${year}`, label: "Last Updated" };
  }

  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) return { value: "Just now", label: "" };
  if (diffInHours < 24) return { value: `${diffInHours}hrs`, label: "ago" };
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return { value: "Yesterday", label: "" };
  if (diffInDays < 7) return { value: `${diffInDays} days`, label: "ago" };
  
  // Format date as DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return { value: `${day}/${month}/${year}`, label: "" };
}

function formatChatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // Format date as DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function HomePage(): React.JSX.Element {
  const { user, loading: authLoading } = useAuth();

  // Use React Query hooks for data fetching with automatic caching
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorDetails,
  } = useDashboardStats();

  const {
    data: recentDocs = [],
    isLoading: docsLoading,
  } = useRecentDocuments(2);

  const {
    data: trendingTopics = [],
    isLoading: trendsLoading,
  } = useTrendingTopics(3);

  const {
    data: recentChats = [],
    isLoading: chatsLoading,
  } = useRecentChats(3);

  const {
    data: userSchemas = [],
    isLoading: schemasLoading,
  } = useUserSchemas(3);

  const {
    data: collectionsInfo,
    isLoading: collectionsLoading,
  } = useCollectionsDocumentCount();
  
  const collectionsDocCount = collectionsInfo?.documentCount || 0;
  const collectionsCount = collectionsInfo?.collectionCount || 0;

  const {
    data: recentExtractions = [],
    isLoading: extractionsLoading,
  } = useRecentExtractions(3);

  // Individual loading states - each card loads separately

  // For unauthenticated users, show the full hero section
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen">
        {/* Full-page Statistics Hero */}
        {statsLoading ? (
          <div className="min-h-[90vh] flex items-center justify-center">
            <div className="container mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <SkeletonStat key={i} />
                ))}
              </div>
            </div>
          </div>
        ) : statsError ? (
          <div className="min-h-[90vh] flex items-center justify-center">
            <div className="p-6 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive max-w-md">
              <p className="text-lg font-medium">Failed to load statistics</p>
              <p className="text-sm mt-2 text-destructive/80">
                {statsErrorDetails instanceof Error ? statsErrorDetails.message : "Unknown error"}
              </p>
            </div>
          </div>
        ) : stats ? (
          <StatsHero stats={stats} formatLastUpdated={formatLastUpdated} />
        ) : null}

        {/* Rest of the content */}
        <PageContainer width="standard" className="py-12">
          {/* University Badge & Auth */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <GraduationCap className="size-4 text-primary" />
              </div>
              <span className="font-medium">Research project by Wroclaw University of Science and Technology</span>
              <Link href="/about" className="text-primary hover:underline ml-1 font-semibold inline-flex items-center gap-1 group">
                Learn more
                <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
            <AuthBanner />
          </div>

          {/* Quick Actions Section */}
        <section className="mb-16">
          <SecondaryHeader title="What would you like to do?" className="mb-6" />
          {statsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <SkeletonQuickAction key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link href="/chat">
                <BaseCard className="rounded-3xl p-6 h-full group/action transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40 dark:hover:border-primary/30">
                  <div className="flex flex-col items-center text-center gap-5">
                    <div className="relative p-4 rounded-2xl bg-gradient-to-br from-blue-100/80 via-indigo-100/60 to-blue-100/60 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/30 shadow-md border border-blue-200/50 dark:border-blue-800/30 transition-all duration-300 group-hover/action:scale-110 group-hover/action:rotate-3 group-hover/action:shadow-xl group-hover/action:shadow-primary/30 group-hover/action:bg-gradient-to-br group-hover/action:from-primary/20 group-hover/action:via-indigo-500/15 group-hover/action:to-primary/15 group-hover/action:border-primary/50">
                      <MessageSquare className="size-7 text-blue-700 dark:text-blue-300 transition-all duration-300 group-hover/action:text-primary group-hover/action:scale-110" />
                    </div>
                    <h3 className="text-xl font-semibold">
                      <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 dark:from-slate-50 dark:via-slate-100 dark:to-slate-50 group-hover/action:from-primary group-hover/action:via-indigo-500 group-hover/action:to-primary dark:group-hover/action:from-primary dark:group-hover/action:via-indigo-400 dark:group-hover/action:to-primary bg-clip-text text-transparent transition-all duration-300">
                        Ask AI Assistant
                      </span>
                    </h3>
                    <p className="text-sm text-muted-foreground group-hover/action:text-foreground line-clamp-2 leading-relaxed transition-colors duration-300">
                      Get instant answers to legal questions with citations
                    </p>
                    <Badge variant="secondary" className="text-xs mt-auto px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 shadow-sm group-hover/action:shadow-lg group-hover/action:bg-primary/10 group-hover/action:border-primary/40 group-hover/action:scale-105 transition-all duration-300">
                      12,500+ questions answered
                    </Badge>
                  </div>
                </BaseCard>
              </Link>
              <Link href="/search">
                <BaseCard className="rounded-3xl p-6 h-full group/action transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40 dark:hover:border-primary/30">
                  <div className="flex flex-col items-center text-center gap-5">
                    <div className="relative p-4 rounded-2xl bg-gradient-to-br from-blue-100/80 via-indigo-100/60 to-blue-100/60 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/30 shadow-md border border-blue-200/50 dark:border-blue-800/30 transition-all duration-300 group-hover/action:scale-110 group-hover/action:rotate-3 group-hover/action:shadow-xl group-hover/action:shadow-primary/30 group-hover/action:bg-gradient-to-br group-hover/action:from-primary/20 group-hover/action:via-indigo-500/15 group-hover/action:to-primary/15 group-hover/action:border-primary/50">
                      <Search className="size-7 text-blue-700 dark:text-blue-300 transition-all duration-300 group-hover/action:text-primary group-hover/action:scale-110" />
                    </div>
                    <h3 className="text-xl font-semibold">
                      <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 dark:from-slate-50 dark:via-slate-100 dark:to-slate-50 group-hover/action:from-primary group-hover/action:via-indigo-500 group-hover/action:to-primary dark:group-hover/action:from-primary dark:group-hover/action:via-indigo-400 dark:group-hover/action:to-primary bg-clip-text text-transparent transition-all duration-300">
                        Search Documents
                      </span>
                    </h3>
                    <p className="text-sm text-muted-foreground group-hover/action:text-foreground line-clamp-2 leading-relaxed transition-colors duration-300">
                      Find relevant cases, judgments, and interpretations
                    </p>
                    <Badge variant="secondary" className="text-xs mt-auto px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 shadow-sm group-hover/action:shadow-lg group-hover/action:bg-primary/10 group-hover/action:border-primary/40 group-hover/action:scale-105 transition-all duration-300">
                      3M+ documents available
                    </Badge>
                  </div>
                </BaseCard>
              </Link>
              <Link href="/collections">
                <BaseCard className="rounded-3xl p-6 h-full group/action transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40 dark:hover:border-primary/30">
                  <div className="flex flex-col items-center text-center gap-5">
                    <div className="relative p-4 rounded-2xl bg-gradient-to-br from-blue-100/80 via-indigo-100/60 to-blue-100/60 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/30 shadow-md border border-blue-200/50 dark:border-blue-800/30 transition-all duration-300 group-hover/action:scale-110 group-hover/action:rotate-3 group-hover/action:shadow-xl group-hover/action:shadow-primary/30 group-hover/action:bg-gradient-to-br group-hover/action:from-primary/20 group-hover/action:via-indigo-500/15 group-hover/action:to-primary/15 group-hover/action:border-primary/50">
                      <FolderOpen className="size-7 text-blue-700 dark:text-blue-300 transition-all duration-300 group-hover/action:text-primary group-hover/action:scale-110" />
                    </div>
                    <h3 className="text-xl font-semibold">
                      <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 dark:from-slate-50 dark:via-slate-100 dark:to-slate-50 group-hover/action:from-primary group-hover/action:via-indigo-500 group-hover/action:to-primary dark:group-hover/action:from-primary dark:group-hover/action:via-indigo-400 dark:group-hover/action:to-primary bg-clip-text text-transparent transition-all duration-300">
                        My Collections
                      </span>
                    </h3>
                    <p className="text-sm text-muted-foreground group-hover/action:text-foreground line-clamp-2 leading-relaxed transition-colors duration-300">
                      Organize and save documents for easy reference
                    </p>
                    <Badge variant="secondary" className="text-xs mt-auto px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 shadow-sm group-hover/action:shadow-lg group-hover/action:bg-primary/10 group-hover/action:border-primary/40 group-hover/action:scale-105 transition-all duration-300">
                      Create your first collection
                    </Badge>
                  </div>
                </BaseCard>
              </Link>
            </div>
          )}
        </section>

        <ConversionCTA />
        </PageContainer>
      </div>
    );
  }

  // For authenticated users, show the redesigned dashboard
  return (
    <PageContainer width="standard" className="py-6 space-y-0">
      {/* All Cards in Single Grid - Legal Glassmorphism 2.0: Responsive Grid Gap */}
      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 md:gap-6 items-stretch">
        {/* Current Statistics Section Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl !p-4 sm:!p-5 md:!p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Current Statistics</h2>
            <Link
              href="/statistics"
              className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col">
            {statsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : statsError ? (
              <div className="p-4 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive">
                <p className="text-sm font-medium">Failed to load statistics</p>
                <p className="text-xs mt-1 text-destructive/80">
                  {statsErrorDetails instanceof Error ? statsErrorDetails.message : "Unknown error"}
                </p>
              </div>
            ) : stats ? (
              <StatsCardV1
                stats={stats}
                formatLastUpdated={formatLastUpdated}
              />
            ) : null}
          </div>
        </BaseCard>

        {/* Your Last Chats Section Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Your Last Chats</h2>
            <Link
              href="/chat"
              className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col">
          {chatsLoading ? (
            <div className="space-y-2 sm:space-y-3">
              {[...Array(3)].map((_, i) => (
                <SkeletonChatCard key={i} />
              ))}
            </div>
          ) : recentChats.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {recentChats.slice(0, 3).map((chat) => {
                const chatTitle = chat.title || chat.firstMessage || "New Chat";
                const truncatedTitle = chatTitle.length > 50 ? chatTitle.substring(0, 47) + "..." : chatTitle;
                return (
                  <Link 
                    key={chat.id} 
                    href={`/chat/${chat.id}`}
                    className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-lg focus-visible:shadow-primary/20"
                  >
                    <BaseCard variant="default" className="p-2.5 sm:p-3 rounded-xl" clickable={true}>
                      <div className="flex items-start gap-2 sm:gap-2.5">
                        <div className="p-1 sm:p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 shrink-0">
                          <MessageSquare className="size-3 sm:size-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                          <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-2">
                            {truncatedTitle}
                          </h3>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-2 sm:size-2.5" />
                            <span>{formatChatTimestamp(chat.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                    </BaseCard>
                </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="p-4 rounded-full w-fit mx-auto mb-3">
                <MessageSquare className="size-8 text-[rgba(71,85,105,0.2)]" />
              </div>
              <p className="text-xs text-[rgba(71,85,105,0.6)] mb-4">No chats yet. Start a conversation to see it here.</p>
              <Link href="/chat">
                <PrimaryButton size="sm" icon={MessageSquare}>
                  Start Chat
                </PrimaryButton>
              </Link>
            </div>
          )}
          </div>
        </BaseCard>

        {/* Your Generated Schemas Section Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Your Last Schemas</h2>
            {userSchemas.length > 0 && (
              <Link
                href="/schema-chat"
                className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
              >
                View all
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="flex-1 flex flex-col">
          {schemasLoading ? (
            <div className="space-y-2 sm:space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <SkeletonChatCard key={i} />
              ))}
            </div>
          ) : userSchemas.length > 0 ? (
            <div className="space-y-2 sm:space-y-2.5">
              {userSchemas.map((schema) => (
                <Link 
                  key={schema.id} 
                  href={`/schema-chat?schemaId=${schema.id}`}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-lg focus-visible:shadow-primary/20"
                >
                  <BaseCard variant="default" className="p-2.5 sm:p-3 rounded-xl" clickable={true}>
                    <div className="flex items-start gap-2 sm:gap-2.5">
                      <div className="p-1 sm:p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 shrink-0">
                        <FileJson className="size-3 sm:size-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-1">
                            {schema.name}
                          </h3>
                          {schema.status && <SchemaStatusBadge status={schema.status} size="sm" />}
                          {schema.is_verified && <VerifiedBadge size="sm" />}
                        </div>
                        {schema.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {schema.description}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{schema.category}</span>
                          <span>•</span>
                          <span>{formatChatTimestamp(schema.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  </BaseCard>
                </Link>
              ))}
            </div>
          ) : (
            // Legal Glassmorphism 2.0 - Zero State
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="p-4 rounded-full w-fit mx-auto mb-3">
                <FileJson className="size-8 text-[rgba(71,85,105,0.2)]" />
              </div>
              <p className="text-xs text-[rgba(71,85,105,0.6)] mb-4">No schemas yet. Generate your first schema using AI agents.</p>
              <Link href="/schema-chat">
                <PrimaryButton size="sm" icon={Zap}>
                  Generate Schema
                </PrimaryButton>
              </Link>
            </div>
          )}
          </div>
        </BaseCard>

        {/* Highlighted Documents Section Card - List Format */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Highlighted Documents</h2>
            <Link
              href="/search"
              className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col">
          {docsLoading ? (
            <div className="space-y-1.5 sm:space-y-2">
              {[...Array(3)].map((_, i) => (
                <SkeletonDocumentCard key={i} />
              ))}
            </div>
          ) : recentDocs.length > 0 ? (
            <div className="space-y-1.5 sm:space-y-2">
              {recentDocs.slice(0, 2).map((doc) => {
                const getDocIcon = () => {
                  if (doc.document_type === 'judgment') return <Scale className="size-3.5 text-primary" />;
                  if (doc.document_type === 'tax_interpretation') return <BarChart className="size-3.5 text-primary" />;
                  return <FileText className="size-3.5 text-primary" />;
                };
                const docTypeLabel = doc.document_type === 'judgment' ? 'JUDGMENT' :
                                    doc.document_type === 'tax_interpretation' ? 'TAX INTERPRETATION' :
                                    doc.document_type?.toUpperCase() || 'DOCUMENT';
                const displayTitle = doc.title || doc.document_number || doc.document_id || 'Untitled Document';
                const displayDate = doc.publication_date ? new Date(doc.publication_date).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                }) : null;
                
                const documentId = cleanDocumentIdForUrl(doc.document_id || doc.id);
                return (
                  <Link 
                    key={doc.id} 
                    href={`/documents/${documentId}`}
                    className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-lg focus-visible:shadow-primary/20"
                  >
                    <BaseCard variant="default" className="p-3 rounded-lg" clickable={true}>
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0">
                          {getDocIcon()}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {docTypeLabel}
                            </span>
                            {displayDate && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {displayDate}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm text-foreground line-clamp-1">
                            {displayTitle}
                          </h3>
                          {doc.document_number && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {doc.document_number}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                    </BaseCard>
                  </Link>
                );
              })}
            </div>
          ) : (
            // Legal Glassmorphism 2.0 - Zero State
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <FileText className="size-6 text-[rgba(71,85,105,0.2)] mx-auto mb-2" />
              <p className="text-xs text-[rgba(71,85,105,0.6)] mb-3">No documents yet. Start exploring to see highlighted documents here.</p>
              <Link href="/search">
                <PrimaryButton size="sm" icon={Search}>
                  Browse Documents
                </PrimaryButton>
              </Link>
            </div>
          )}
          </div>
        </BaseCard>

        {/* Trending Topics Section Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Trending Topics</h2>
          </div>
          <div className="flex-1 flex flex-col">
          {trendsLoading ? (
            <div className="space-y-2 sm:space-y-2.5">
              {[...Array(2)].map((_, i) => (
                <SkeletonTrendingTopic key={i} />
              ))}
            </div>
          ) : trendingTopics.length > 0 ? (
            <div className="space-y-2 sm:space-y-2.5">
              {trendingTopics.map((topic, index) => (
                <BaseCard key={index} variant="light" className="p-2.5 rounded-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">{topic.topic}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-medium">{topic.category}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {topic.trend === "up" && (
                        <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                      {topic.trend === "down" && (
                        <TrendingDown className="size-4 text-red-600 dark:text-red-400" />
                      )}
                      {topic.trend === "stable" && (
                        <Minus className="size-4 text-muted-foreground" />
                      )}
                      <span className={cn(
                        "text-xs font-semibold",
                        topic.trend === "up" ? "text-emerald-600 dark:text-emerald-400" :
                        topic.trend === "down" ? "text-red-600 dark:text-red-400" :
                        "text-muted-foreground"
                      )}>
                        {topic.change}
                      </span>
                    </div>
                  </div>
                </BaseCard>
              ))}
            </div>
          ) : (
            // Legal Glassmorphism 2.0 - Zero State
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <TrendingUp className="size-6 text-[rgba(71,85,105,0.2)] mx-auto mb-2" />
              <p className="text-xs text-[rgba(71,85,105,0.6)]">No trending topics available</p>
            </div>
          )}
          </div>
        </BaseCard>

        {/* Documents in Collections Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Documents in Collections</h2>
            <Link
              href="/collections"
              className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col">
            {collectionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-primary/20">
                    <Database className="size-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">
                      {formatStatNumber(collectionsCount)}
                    </div>
                    <div className="text-xs text-muted-foreground">Collections</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-primary/20">
                    <FileText className="size-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-foreground">
                      {formatStatNumber(collectionsDocCount)}
                    </div>
                    <div className="text-xs text-muted-foreground">Documents</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </BaseCard>

        {/* Last Extractions Card */}
        <BaseCard className="rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 h-full flex flex-col min-h-0" variant="light">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F1F5F9]">Last Extractions</h2>
            <Link
              href="/extract"
              className="text-sm text-black dark:text-white font-semibold flex items-center gap-1.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full px-3 py-1.5 -mx-3 -my-1.5 backdrop-blur-sm bg-white/50 dark:bg-slate-800/50 border border-white/60 dark:border-white/20 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-white/80 dark:hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_0_24px_rgba(255,255,255,0.05)] hover:scale-105 hover:-translate-y-0.5"
            >
              View all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex-1 flex flex-col">
            {extractionsLoading ? (
              <div className="space-y-1.5 sm:space-y-2">
                {[...Array(3)].map((_, i) => (
                  <SkeletonExtractionCard key={i} />
                ))}
              </div>
            ) : recentExtractions.length > 0 ? (
              <div className="space-y-1.5 sm:space-y-2">
                {recentExtractions.map((job) => {
                  const statusColor =
                    job.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400' :
                    job.status === 'FAILURE' ? 'text-red-600 dark:text-red-400' :
                    'text-amber-600 dark:text-amber-400';
                  return (
                    <Link
                      key={job.job_id}
                      href={`/extract?jobId=${job.job_id}`}
                      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-lg focus-visible:shadow-primary/20"
                    >
                      <BaseCard variant="default" className="p-2.5 sm:p-3 rounded-lg" clickable={true}>
                        <div className="flex items-start gap-2 sm:gap-2.5">
                          <div className="p-1 sm:p-1.5 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0">
                            <Zap className="size-3 sm:size-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-1">
                                {job.collection_name || 'Extraction Job'}
                              </h3>
                              <span className={cn("text-xs font-medium", statusColor)}>
                                {job.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="size-2 sm:size-2.5" />
                              <span>{formatChatTimestamp(job.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </BaseCard>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <div className="p-4 rounded-full w-fit mx-auto mb-3">
                  <Zap className="size-8 text-[rgba(71,85,105,0.2)]" />
                </div>
                <p className="text-xs text-[rgba(71,85,105,0.6)] mb-4">No extractions yet. Start extracting data from documents.</p>
                <Link href="/extract">
                  <PrimaryButton size="sm" icon={Zap}>
                    Start Extraction
                  </PrimaryButton>
                </Link>
              </div>
            )}
          </div>
        </BaseCard>
      </div>
    </PageContainer>
  );
}
