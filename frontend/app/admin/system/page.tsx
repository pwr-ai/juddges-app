"use client";

import { CheckCircle2, AlertCircle, MinusCircle, Activity } from "lucide-react";
import { useAdminSystemHealth, type ServiceHealth } from "@/lib/api/admin";

interface StatusBadgeProps {
 status: ServiceHealth["status"];
}

function StatusBadge({ status }: StatusBadgeProps) {
 if (status === "healthy") {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700">
 <CheckCircle2 className="size-3"/>
 Healthy
 </span>
 );
 }
 if (status === "degraded") {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
 <AlertCircle className="size-3"/>
 Degraded
 </span>
 );
 }
 if (status === "unhealthy") {
 return (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700">
 <AlertCircle className="size-3"/>
 Unhealthy
 </span>
 );
 }
 return (
 <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
 <MinusCircle className="size-3"/>
 Unknown
 </span>
 );
}

interface InfoRowProps {
 label: string;
 value: React.ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
 return (
 <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
 <span className="text-sm text-muted-foreground shrink-0">{label}</span>
 <span className="text-sm text-foreground text-right">{value}</span>
 </div>
 );
}

function ServiceCardSkeleton() {
 return (
 <div className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
 <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
 <div className="rounded-lg bg-muted size-9"/>
 <div className="flex-1">
 <div className="h-5 w-32 rounded bg-muted mb-1"/>
 <div className="h-3 w-24 rounded bg-muted"/>
 </div>
 <div className="h-6 w-20 rounded-full bg-muted"/>
 </div>
 <div className="px-6 py-2">
 {Array.from({ length: 2 }).map((_, i) => (
 <div
 key={i}
 className="flex justify-between py-3 border-b border-border last:border-0"
 >
 <div className="h-4 w-24 rounded bg-muted"/>
 <div className="h-4 w-20 rounded bg-muted"/>
 </div>
 ))}
 </div>
 </div>
 );
}

export default function AdminSystemPage() {
 const { data, isLoading, isError, error } = useAdminSystemHealth();

 const services = data ? Object.entries(data.services) : [];

 return (
 <div className="min-h-screen bg-background px-8 py-10">
 <div className="max-w-4xl mx-auto">

 {/* Page heading */}
 <div className="mb-8">
 <h1 className="font-serif text-4xl text-foreground tracking-tight">System</h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Infrastructure status and service health.
 </p>
 </div>

 {/* Overall status banner */}
 {!isLoading && data && (
 <div
 className={[
"mb-6 flex items-center gap-3 rounded-xl border px-5 py-3",
 data.status === "healthy"
 ? "border-green-200 bg-green-50"
 : data.status === "degraded"
 ? "border-amber-200 bg-amber-50"
 : "border-red-200 bg-red-50",
 ].join("")}
 >
 <Activity
 className={[
"size-4",
 data.status === "healthy"
 ? "text-green-600"
 : data.status === "degraded"
 ? "text-amber-600"
 : "text-red-600",
 ].join("")}
 />
 <span
 className={[
"text-sm font-medium capitalize",
 data.status === "healthy"
 ? "text-green-700"
 : data.status === "degraded"
 ? "text-amber-700"
 : "text-red-700",
 ].join("")}
 >
 Overall status: {data.status}
 </span>
 </div>
 )}

 {/* Error */}
 {isError && (
 <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
 Failed to load system health: {(error as Error).message}
 </div>
 )}

 <div className="flex flex-col gap-6">
 {isLoading ? (
 Array.from({ length: 4 }).map((_, i) => (
 <ServiceCardSkeleton key={i} />
 ))
 ) : services.length === 0 ? (
 <div className="rounded-2xl border border-border bg-card py-16 text-center">
 <p className="text-sm text-muted-foreground">
 No service health data available.
 </p>
 </div>
 ) : (
 services.map(([key, svc]) => (
 <div
 key={key}
 className="rounded-2xl border border-border bg-card overflow-hidden"
 >
 <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
 <div className="rounded-lg bg-primary/8 p-2">
 <Activity className="size-5 text-primary"/>
 </div>
 <div className="flex-1">
 <h2 className="font-serif text-xl text-foreground capitalize">
 {svc.name ?? key}
 </h2>
 </div>
 <StatusBadge status={svc.status} />
 </div>
 <div className="px-6 py-2">
 {svc.response_time_ms !== null && (
 <InfoRow
 label="Response time"
 value={
 <span className="tabular-nums">
 {svc.response_time_ms} ms
 </span>
 }
 />
 )}
 {svc.message && (
 <InfoRow label="Message"value={svc.message} />
 )}
 {svc.response_time_ms === null && !svc.message && (
 <InfoRow
 label="Details"
 value={
 <span className="text-muted-foreground/60 italic">
 No details available
 </span>
 }
 />
 )}
 </div>
 </div>
 ))
 )}
 </div>

 </div>
 </div>
 );
}
