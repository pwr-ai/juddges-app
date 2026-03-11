"use client";

import { BookOpen, CheckCircle2, PenLine, Eye } from "lucide-react";
import { useAdminContentStats } from "@/lib/api/admin";

function StatCardSkeleton() {
 return (
 <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
 <div className="mb-4 rounded-lg bg-muted p-2 size-9"/>
 <div className="h-8 w-20 rounded bg-muted mb-1"/>
 <div className="h-4 w-28 rounded bg-muted"/>
 </div>
 );
}

export default function AdminContentPage() {
 const { data, isLoading, isError, error } = useAdminContentStats();

 const statCards = data
 ? [
 {
 label: "Total Posts",
 value: data.total_posts.toLocaleString(),
 icon: BookOpen,
 },
 {
 label: "Published",
 value: data.published.toLocaleString(),
 icon: CheckCircle2,
 },
 {
 label: "Drafts",
 value: data.drafts.toLocaleString(),
 icon: PenLine,
 },
 {
 label: "Total Views",
 value: data.total_views.toLocaleString(),
 icon: Eye,
 },
 ]
 : null;

 return (
 <div className="min-h-screen bg-background px-8 py-10">
 <div className="max-w-6xl mx-auto">

 {/* Page heading */}
 <div className="mb-8">
 <h1 className="font-serif text-4xl text-foreground tracking-tight">Content</h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Blog publishing statistics.
 </p>
 </div>

 {/* Error */}
 {isError && (
 <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
 Failed to load content stats: {(error as Error).message}
 </div>
 )}

 {/* Stat cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
 {isLoading
 ? Array.from({ length: 4 }).map((_, i) => (
 <StatCardSkeleton key={i} />
 ))
 : statCards?.map((card) => {
 const Icon = card.icon;
 return (
 <div
 key={card.label}
 className="rounded-2xl border border-border bg-card p-6"
 >
 <div className="mb-4 rounded-lg bg-primary/8 p-2 w-fit">
 <Icon className="size-5 text-primary"/>
 </div>
 <p className="text-3xl font-semibold text-foreground tabular-nums">
 {card.value}
 </p>
 <p className="mt-0.5 text-sm text-muted-foreground">{card.label}</p>
 </div>
 );
 })}
 </div>

 {/* Summary card */}
 {!isLoading && data && (
 <div className="rounded-2xl border border-border bg-card p-6">
 <h2 className="font-serif text-xl text-foreground mb-4">
 Publishing Overview
 </h2>
 <div className="flex flex-col gap-3">
 <div className="flex items-center justify-between border-b border-border pb-3">
 <span className="text-sm text-muted-foreground">
 Publication rate
 </span>
 <span className="text-sm font-medium text-foreground tabular-nums">
 {data.total_posts > 0
 ? `${Math.round((data.published / data.total_posts) * 100)}%`
 : "—"}
 </span>
 </div>
 <div className="flex items-center justify-between border-b border-border pb-3">
 <span className="text-sm text-muted-foreground">
 Avg views per published post
 </span>
 <span className="text-sm font-medium text-foreground tabular-nums">
 {data.published > 0
 ? Math.round(data.total_views / data.published).toLocaleString()
 : "—"}
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-sm text-muted-foreground">
 Drafts awaiting review
 </span>
 <span className="text-sm font-medium text-foreground tabular-nums">
 {data.drafts.toLocaleString()}
 </span>
 </div>
 </div>
 </div>
 )}

 {!isLoading && !isError && !data && (
 <div className="rounded-2xl border border-border bg-card py-16 text-center">
 <p className="text-sm text-muted-foreground">No content data available.</p>
 </div>
 )}

 </div>
 </div>
 );
}
