"use client";

import { FileText, Globe, Scale, Tag } from "lucide-react";
import { useAdminDocumentStats } from "@/lib/api/admin";

function StatCardSkeleton() {
 return (
 <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
 <div className="mb-4 rounded-lg bg-muted p-2 size-9"/>
 <div className="h-8 w-24 rounded bg-muted mb-1"/>
 <div className="h-4 w-32 rounded bg-muted"/>
 </div>
 );
}

function BreakdownTableSkeleton() {
 return (
 <div className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
 <div className="px-6 py-5 border-b border-border">
 <div className="h-6 w-32 rounded bg-muted"/>
 </div>
 <div className="p-6 flex flex-col gap-3">
 {Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="flex justify-between">
 <div className="h-4 w-24 rounded bg-muted"/>
 <div className="h-4 w-12 rounded bg-muted"/>
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
 <div className="rounded-2xl border border-border bg-card overflow-hidden">
 <div className="px-6 py-5 border-b border-border">
 <h2 className="font-serif text-xl text-foreground">{title}</h2>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-border">
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Category
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
 No data.
 </td>
 </tr>
 ) : (
 entries.map(([key, count]) => (
 <tr key={key} className="border-b border-border last:border-0">
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
 const { data, isLoading, isError, error } = useAdminDocumentStats();

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
 <h1 className="font-serif text-4xl text-foreground tracking-tight">Documents</h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Corpus statistics and breakdown.
 </p>
 </div>

 {/* Error */}
 {isError && (
 <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
 Failed to load document stats: {(error as Error).message}
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
