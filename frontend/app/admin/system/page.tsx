"use client";

import { Activity } from "lucide-react";
import { useAdminSystemHealth, type ServiceHealth } from "@/lib/api/admin";
import { ErrorCard } from "@/lib/styles/components";
import { StatusBadge } from "@/components/editorial";
import logger from "@/lib/logger";
import { useEffect } from "react";

const pageLogger = logger.child("AdminSystemPage");

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
 const { data, isLoading, isError, error, refetch } = useAdminSystemHealth();

 // The raw exception is for us, not for the admin looking at the screen.
 useEffect(() => {
 if (error) pageLogger.error("Failed to load system health", error);
 }, [error]);

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
            "mb-6 flex items-center gap-3 rounded-none border border-rule bg-parchment px-5 py-3 border-l-2",
            data.status === "healthy"
              ? "border-l-ink"
              : data.status === "degraded"
                ? "border-l-gold"
                : "border-l-oxblood",
          ].join(" ")}
        >
          <Activity
            className={[
              "size-4",
              data.status === "healthy"
                ? "text-ink"
                : data.status === "degraded"
                  ? "text-gold"
                  : "text-oxblood",
            ].join(" ")}
          />
          <span className="text-sm font-medium font-mono capitalize text-ink">
            Overall status: {data.status}
          </span>
        </div>
      )}

 {/* Error */}
 {isError && (
 <div role="alert"className="mb-6">
 <ErrorCard
 title="The health check could not be run"
 message="The health endpoint did not respond, so the status of the database, search index and worker services is unknown. Unknown is not the same as down — the check itself failed. Re-run it, and if it keeps failing inspect the backend container logs directly."
 onRetry={() => { void refetch(); }}
 retryLabel="Re-run health check"
 />
 </div>
 )}

 <div className="flex flex-col gap-6">
 {isLoading ? (
 Array.from({ length: 4 }).map((_, i) => (
 <ServiceCardSkeleton key={i} />
 ))
 ) : isError ? null : services.length === 0 ? (
 <div className="rounded-2xl border border-border bg-card py-16 text-center">
 <p className="text-sm text-muted-foreground">
 The health check ran but reported no services. Confirm the backend is
 running with health reporting enabled, then re-run the check.
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
