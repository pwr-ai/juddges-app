"use client";

import {
 Users,
 FileText,
 Search,
 Activity,
 CheckCircle2,
 AlertCircle,
 MinusCircle,
 ShieldCheck,
} from "lucide-react";
import {
 useAdminStats,
 useAdminActivity,
 useAdminSystemHealth,
} from "@/lib/api/admin";
import { useDashboardStats } from "@/lib/api/dashboard";
import { ErrorCard } from "@/lib/styles/components";
import logger from "@/lib/logger";
import { useEffect } from "react";

const pageLogger = logger.child("AdminDashboardPage");

function formatDate(iso: string): string {
 return new Date(iso).toLocaleString(undefined, {
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 });
}

function formatPct(value: number | undefined | null): string {
 if (value === undefined || value === null || Number.isNaN(value)) return "—";
 return `${value.toFixed(1)}%`;
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
 const dashboardStatsQuery = useDashboardStats();
 const activityQuery = useAdminActivity(8);
 const healthQuery = useAdminSystemHealth();

 // Raw error text must never reach the screen: it leaks internals and tells an
 // admin nothing they can act on. Keep it in the console for debugging instead.
 useEffect(() => {
 if (statsQuery.error) pageLogger.error("Failed to load admin stats", statsQuery.error);
 if (dashboardStatsQuery.error) pageLogger.error("Failed to load corpus stats", dashboardStatsQuery.error);
 if (activityQuery.error) pageLogger.error("Failed to load recent activity", activityQuery.error);
 if (healthQuery.error) pageLogger.error("Failed to load system health", healthQuery.error);
 }, [statsQuery.error, dashboardStatsQuery.error, activityQuery.error, healthQuery.error]);

 const stats = statsQuery.data;
 const dashboardStats = dashboardStatsQuery.data;
 const activity = activityQuery.data ?? [];
 const health = healthQuery.data;

 const totalDocsValue = dashboardStats
 ? dashboardStats.total_judgments.toLocaleString()
 : stats?.total_documents.toLocaleString() ?? "—";

 const embeddingsPct = dashboardStats?.data_completeness?.embeddings_pct;
 const summaryPct = dashboardStats?.data_completeness?.with_summary_pct;

 const statCards = stats
 ? [
 {
 label: "Total Users",
 value: stats.total_users.toLocaleString(),
 icon: Users,
 },
 {
 label: "Total Documents",
 value: totalDocsValue,
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
 <div role="alert"className="mb-6">
 <ErrorCard
 title="Platform statistics could not be loaded"
 message="The admin statistics endpoint did not respond, so the user, document and search counters below are unavailable. This is usually a temporary backend outage — retry, and if it keeps failing check Admin → System for service health."
 onRetry={() => { void statsQuery.refetch(); }}
 retryLabel="Reload statistics"
 />
 </div>
 )}

 {/* Stat cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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

 {/* Data Quality tile (sub-metric for corpus) */}
 <div className="mb-10">
 {dashboardStatsQuery.isError ? (
 <div role="alert">
 <ErrorCard
 title="Corpus data-quality figures could not be loaded"
 message="The corpus statistics endpoint did not respond, so embedding and AI-summary coverage are unknown right now. The corpus itself is unaffected — retry, and if it keeps failing check Admin → System for service health."
 onRetry={() => { void dashboardStatsQuery.refetch(); }}
 retryLabel="Reload data quality"
 />
 </div>
 ) : dashboardStatsQuery.isLoading ? (
 <StatCardSkeleton />
 ) : dashboardStats ? (
 <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
 <div className="flex items-start justify-between">
 <div className="rounded-lg bg-primary/8 p-2">
 <ShieldCheck className="size-5 text-primary"/>
 </div>
 <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
 Corpus data quality
 </span>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
 <div>
 <p className="text-3xl font-semibold text-foreground tabular-nums">
 {formatPct(embeddingsPct)}
 </p>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Documents with embeddings
 </p>
 </div>
 <div>
 <p className="text-3xl font-semibold text-foreground tabular-nums">
 {formatPct(summaryPct)}
 </p>
 <p className="mt-0.5 text-sm text-muted-foreground">
 Documents with AI summary
 </p>
 </div>
 </div>
 </div>
 ) : null}
 </div>

 {/* Two-column lower section */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

 {/* Recent Activity – spans 2 cols */}
 <div className="lg:col-span-2 rounded-2xl border border-border bg-card">
 <div className="px-6 py-5 border-b border-border">
 <h2 className="font-serif text-xl text-foreground">Recent Activity</h2>
 </div>

 {activityQuery.isError && (
 <div role="alert"className="m-6">
 <ErrorCard
 title="Recent activity could not be loaded"
 message="The audit-log endpoint did not respond, so the activity feed is empty rather than genuinely quiet. Retry to fetch it again."
 onRetry={() => { void activityQuery.refetch(); }}
 retryLabel="Reload activity"
 />
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
 No activity has been recorded yet. User sign-ins, searches and document actions will appear here as they happen.
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
 <div role="alert"className="m-6">
 <ErrorCard
 title="Service health could not be loaded"
 message="The health-check endpoint did not respond. That does not by itself mean the services are down — the check could not run. Retry, and if it keeps failing inspect the backend container logs directly."
 onRetry={() => { void healthQuery.refetch(); }}
 retryLabel="Re-run health check"
 />
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
 The health check returned no services. Confirm the backend is running with health reporting enabled, then re-run the check.
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
