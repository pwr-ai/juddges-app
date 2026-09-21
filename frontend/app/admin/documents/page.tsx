"use client";

import { FileText, Globe, Scale, Tag } from "lucide-react";
import { useAdminDocumentStats } from "@/lib/api/admin";
import { ErrorCard } from "@/lib/styles/components";
import logger from "@/lib/logger";
import { useEffect } from "react";

const pageLogger = logger.child("AdminDocumentsPage");

function StatCardSkeleton() {
 return (
 <div className="rounded-none border border-rule bg-parchment p-6 animate-pulse">
 <div className="mb-4 rounded-none bg-parchment-deep p-2 size-9"/>
 <div className="h-8 w-24 rounded-none bg-parchment-deep mb-1"/>
 <div className="h-4 w-32 rounded-none bg-parchment-deep"/>
 </div>
 );
}

function BreakdownTableSkeleton() {
 return (
 <div className="rounded-none border border-rule bg-parchment overflow-hidden animate-pulse">
 <div className="px-6 py-5 border-b border-rule">
 <div className="h-6 w-32 rounded-none bg-parchment-deep"/>
 </div>
 <div className="p-6 flex flex-col gap-3">
 {Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="flex justify-between">
 <div className="h-4 w-24 rounded-none bg-parchment-deep"/>
 <div className="h-4 w-12 rounded-none bg-parchment-deep"/>
 </div>
 ))}
 </div>
 </div>
 );
}

function BreakdownTable({
 title,
 data,
}: {
 title: string;
 data: Record<string, number>;
}) {
 const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
 return (
 <div className="rounded-none border border-rule bg-parchment overflow-hidden">
 <div className="px-6 py-5 border-b border-rule">
 <h2 className="font-serif text-xl text-foreground">{title}</h2>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-rule">
 <th className="px-6 py-3 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider">
 Category
 </th>
 <th className="px-6 py-3 text-right text-xs font-mono text-muted-foreground uppercase tracking-wider">
 Count
 </th>
 </tr>
 </thead>
 <tbody>
 {entries.length === 0 ? (
 <tr>
 <td
 colSpan={2}
 className="px-6 py-8 text-center text-sm text-muted-foreground"
 >
 Nothing to break down here yet — no ingested document carries this attribute.
 </td>
 </tr>
 ) : (
 entries.map(([key, count]) => (
 <tr key={key} className="border-b border-rule last:border-0">
 <td className="px-6 py-3.5 font-medium text-foreground capitalize">
 {key}
 </td>
 <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
 {count.toLocaleString()}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 );
}

export default function AdminDocumentsPage() {
 const { data, isLoading, isError, error, refetch } = useAdminDocumentStats();

 // The raw exception is for us, not for the admin looking at the screen.
 useEffect(() => {
 if (error) pageLogger.error("Failed to load document stats", error);
 }, [error]);

 const statCards = data
 ? [
 {
 label: "Total Documents",
 value: data.total.toLocaleString(),
 icon: Scale,
 },
 {
 label: "Added This Week",
 value: data.added_this_week.toLocaleString(),
 icon: FileText,
 },
 {
 label: "Document Types",
 value: Object.keys(data.by_type).length.toLocaleString(),
 icon: Tag,
 },
 {
 label: "Jurisdictions",
 value: Object.keys(data.by_country).length.toLocaleString(),
 icon: Globe,
 },
 ]
 : null;

 return (
 <div className="min-h-screen bg-background px-8 py-10">
 <div className="max-w-6xl mx-auto">

 {/* Page heading */}
 <div className="mb-8">
 <h1 className="font-serif text-3xl font-normal text-foreground tracking-tight">Documents</h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Corpus statistics and breakdown.
 </p>
 </div>

 {/* Error */}
 {isError && (
 <div role="alert"className="mb-6">
 <ErrorCard
 title="Corpus statistics could not be loaded"
 message="The document statistics endpoint did not respond, so the counters and breakdowns below are unavailable. The corpus itself is unaffected — this is a reporting failure. Retry, and if it keeps failing check Admin → System for service health."
 onRetry={() => { void refetch(); }}
 retryLabel="Reload statistics"
 />
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
 className="rounded-none border border-rule bg-parchment p-6"
 >
 <div className="mb-4 rounded-none border border-rule bg-parchment-deep p-2 w-fit">
 <Icon className="size-5 text-ink"/>
 </div>
 <p className="text-3xl font-semibold text-foreground tabular-nums">
 {card.value}
 </p>
 <p className="mt-0.5 text-sm text-muted-foreground">{card.label}</p>
 </div>
 );
 })}
 </div>

 {/* Breakdown tables */}
 {isLoading ? (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <BreakdownTableSkeleton />
 <BreakdownTableSkeleton />
 <BreakdownTableSkeleton />
 </div>
 ) : data ? (
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <BreakdownTable title="By Type"data={data.by_type} />
 <BreakdownTable title="By Country"data={data.by_country} />
 <BreakdownTable title="By Language"data={data.by_language} />
 </div>
 ) : null}

 </div>
 </div>
 );
}
