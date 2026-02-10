import { cn } from "@/lib/utils";

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl py-3 flex flex-col h-full glass-card glass-card--tile min-h-[360px]", className)}>
      <div className="relative z-10 flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 rounded-full bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="h-6 w-24 rounded-full bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        </div>
        
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse flex-shrink-0" />
          <div className="h-5 w-full rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        </div>
        
        {/* Metadata */}
        <div className="space-y-3 mt-2">
          <div className="h-4 w-24 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="space-y-2 rounded-lg p-3 border border-slate-200/50 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/30 backdrop-blur-sm">
            <div className="h-3 w-full rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          </div>
        </div>
        
        {/* Keywords */}
        <div className="space-y-2 mt-auto">
          <div className="h-4 w-20 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="flex flex-wrap gap-2">
            <div className="h-7 w-20 rounded-md bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
            <div className="h-7 w-24 rounded-md bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
            <div className="h-7 w-16 rounded-md bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          </div>
        </div>
        
        {/* Buttons */}
        <div className="flex gap-2 mt-4">
          <div className="h-9 flex-1 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="h-9 flex-1 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// Skeleton for chat/schema cards (smaller, matches actual content)
export function SkeletonChatCard({ className }: { className?: string }) {
  return (
    <div className={cn("p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50", className)}>
      <div className="flex items-start gap-2.5">
        <div className="h-6 w-6 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-3.5 w-full rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="h-3 w-20 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// Skeleton for document cards (matches actual content height)
export function SkeletonDocumentCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-lg bg-background/50 dark:bg-slate-800/50 border border-border/50", className)}>
      <div className="h-6 w-6 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="h-2.5 w-16 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="h-3 w-12 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0" />
        </div>
        <div className="h-4 w-full rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-3 w-24 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
      </div>
      <div className="h-4 w-4 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0 mt-0.5" />
    </div>
  );
}

// Skeleton for extraction cards (matches actual content height)
export function SkeletonExtractionCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 p-2 rounded-lg bg-background/50 dark:bg-slate-800/50 border border-border/50", className)}>
      <div className="h-5 w-5 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
          <div className="h-3 w-12 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse shrink-0" />
        </div>
        <div className="h-3 w-16 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn("group relative overflow-hidden rounded-xl glass-card glass-card--tile p-4", className)}>
      <div className="space-y-0.5 mb-2">
        <div className="h-4 w-32 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-12 w-28 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse mt-2" />
      </div>
      <div className="h-4 w-36 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
    </div>
  );
}

export function SkeletonQuickAction({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl glass-card glass-card--tile p-6 h-full min-h-[280px]", className)}>
      <div className="flex flex-col items-center text-center gap-5 h-full">
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse">
          <div className="h-7 w-7" />
        </div>
        <div className="h-6 w-40 rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-7 w-32 rounded-full bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse mt-auto" />
      </div>
    </div>
  );
}

export function SkeletonSearch({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="h-16 w-full rounded-2xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
    </div>
  );
}

export function SkeletonTrendingTopic({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 p-3 rounded-xl glass-card glass-card--tile", className)}>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-32 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-3 w-24 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        <div className="h-4 w-4 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
        <div className="h-4 w-8 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
      </div>
    </div>
  );
}

export function SkeletonInsight({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-between items-center p-3 rounded-xl glass-card glass-card--tile", className)}>
      <div className="h-4 w-32 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
      <div className="h-4 w-20 rounded bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 dark:from-slate-800/60 dark:via-slate-700/60 dark:to-slate-800/60 backdrop-blur-sm animate-pulse" />
    </div>
  );
}
