"use client";

import {
 Users,
 FileText,
 Search,
 Activity,
 CheckCircle2,
 AlertCircle,
 MinusCircle,
} from "lucide-react";
import {
 useAdminStats,
 useAdminActivity,
 useAdminSystemHealth,
} from "@/lib/api/admin";

function formatDate(iso: string): string {
 return new Date(iso).toLocaleString(undefined, {
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 });
}

function StatCardSkeleton() {
 return (
 <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 animate-pulse">
 <div className="flex items-start justify-between">
 <div className="rounded-lg bg-muted p-2 size-9"/>
 <div className="h-5 w-14 rounded-full bg-muted"/>
 </div>
 <div>
 <div className="h-8 w-20 rounded bg-muted mb-1"/>
 <div className="h-4 w-28 rounded bg-muted"/>
 </div>
 </div>
 );
}

export default function AdminDashboardPage() {
 const statsQuery = useAdminStats();
 const activityQuery = useAdminActivity(8);
 const healthQuery = useAdminSystemHealth();

 const stats = statsQuery.data;
 const activity = activityQuery.data ?? [];
 const health = healthQuery.data;

 const statCards = stats
 ? [
 {
 label: "Total Users",
 value: stats.total_users.toLocaleString(),
 icon: Users,
 },
 {
 label: "Total Documents",
 value: stats.total_documents.toLocaleString(),
 icon: FileText,
 },
 {
 label: "Search Queries Today",
 value: stats.searches_today.toLocaleString(),
 icon: Search,
 },
 {
 label: "Active Sessions (24 h)",
 value: stats.active_sessions_24h.toLocaleString(),
 icon: Activity,
 },
 ]
 : null;

 return (
 <div className="min-h-screen bg-background px-8 py-10">
 <div className="max-w-6xl mx-auto">

 {/* Page heading */}
 <div className="mb-8">
 <h1 className="font-serif text-4xl text-foreground tracking-tight">Overview</h1>
 <p className="mt-1 text-sm text-muted-foreground">Platform health and activity at a glance.</p>
 </div>

 {/* Stats error */}
 {statsQuery.isError && (
 <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
 Failed to load statistics: {(statsQuery.error as Error).message}
 </div>
 )}

 {/* Stat cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
 {statsQuery.isLoading
 ? Array.from({ length: 4 }).map((_, i) => (
 <StatCardSkeleton key={i} />
 ))
 : statCards?.map((card) => {
 const Icon = card.icon;
 return (
 <div
 key={card.label}
 className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4"
 >
 <div className="flex items-start justify-between">
 <div className="rounded-lg bg-primary/8 p-2">
 <Icon className="size-5 text-primary"/>
 </div>
 </div>
 <div>
 <p className="text-3xl font-semibold text-foreground tabular-nums">
 {card.value}
 </p>
 <p className="mt-0.5 text-sm text-muted-foreground">{card.label}</p>
 </div>
 </div>
 );
 })}
 </div>

 {/* Two-column lower section */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

 {/* Recent Activity – spans 2 cols */}
 <div className="lg:col-span-2 rounded-2xl border border-border bg-card">
 <div className="px-6 py-5 border-b border-border">
 <h2 className="font-serif text-xl text-foreground">Recent Activity</h2>
 </div>

 {activityQuery.isError && (
 <div className="px-6 py-4 text-sm text-red-600">
 Failed to load activity.
 </div>
 )}

 {activityQuery.isLoading && (
 <div className="p-6 flex flex-col gap-3 animate-pulse">
 {Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="flex gap-4">
 <div className="h-4 w-40 rounded bg-muted"/>
 <div className="h-4 flex-1 rounded bg-muted"/>
 <div className="h-4 w-16 rounded bg-muted"/>
 </div>
 ))}
 </div>
 )}

 {!activityQuery.isLoading && !activityQuery.isError && (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-border">
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 User
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Action
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Time
 </th>
 </tr>
 </thead>
 <tbody>
 {activity.length === 0 ? (
 <tr>
 <td
 colSpan={3}
 className="px-6 py-10 text-center text-sm text-muted-foreground"
 >
 No recent activity.
 </td>
 </tr>
 ) : (
 activity.map((row) => (
 <tr
 key={row.id}
 className="border-b border-border last:border-0"
 >
 <td className="px-6 py-3.5 text-foreground font-medium whitespace-nowrap">
 {row.user_email ?? (
 <span className="italic text-muted-foreground/60">
 anonymous
 </span>
 )}
 </td>
 <td className="px-6 py-3.5 text-muted-foreground">
 {row.action_type}
 {row.resource_type && (
 <span className="text-muted-foreground/60">
 {""}
 · {row.resource_type}
 </span>
 )}
 </td>
 <td className="px-6 py-3.5 text-right text-muted-foreground/70 whitespace-nowrap">
 {formatDate(row.created_at)}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 )}
 </div>

 {/* System Health */}
 <div className="rounded-2xl border border-border bg-card">
 <div className="px-6 py-5 border-b border-border">
 <h2 className="font-serif text-xl text-foreground">System Health</h2>
 </div>

 {healthQuery.isError && (
 <div className="px-6 py-4 text-sm text-red-600">
 Failed to load health status.
 </div>
 )}

 {healthQuery.isLoading && (
 <div className="p-6 flex flex-col gap-4 animate-pulse">
 {Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="flex items-center justify-between">
 <div className="h-4 w-24 rounded bg-muted"/>
 <div className="h-5 w-16 rounded-full bg-muted"/>
 </div>
 ))}
 </div>
 )}

 {!healthQuery.isLoading && !healthQuery.isError && (
 <div className="p-6 flex flex-col gap-4">
 {health && Object.entries(health.services).length > 0 ? (
 Object.entries(health.services).map(([key, svc]) => (
 <div key={key} className="flex items-center justify-between">
 <span className="text-sm text-foreground capitalize">
 {svc.name ?? key}
 </span>
 {svc.status === "healthy"? (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700">
 <CheckCircle2 className="size-3"/>
 Healthy
 </span>
 ) : svc.status === "degraded"? (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
 <AlertCircle className="size-3"/>
 Degraded
 </span>
 ) : svc.status === "unhealthy"? (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700">
 <AlertCircle className="size-3"/>
 Unhealthy
 </span>
 ) : (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
 <MinusCircle className="size-3"/>
 Unknown
 </span>
 )}
 </div>
 ))
 ) : (
 <p className="text-sm text-muted-foreground text-center py-4">
 No health data.
 </p>
 )}
 </div>
 )}
 </div>

 </div>
 </div>
 </div>
 );
}
