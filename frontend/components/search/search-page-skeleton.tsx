"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SearchPageSkeleton() {
 return (
 <div className={cn(
"container mx-auto px-4 md:px-8 max-w-6xl",
"animate-in fade-in duration-150"
 )} style={{
 paddingTop: 'clamp(1.5rem, 3vh, 2.5rem)',
 paddingBottom: 'clamp(2rem, 4vh, 3rem)'
 }}>
 {/* Wrapper for centered content */}
 <div className="flex flex-col items-center">
 {/* Header skeleton */}
 <div className="w-full text-center mb-6 md:mb-8">
 <div className="flex flex-col items-center gap-4">
 <div className="flex items-center gap-3">
 <Skeleton className="h-12 w-12 rounded-lg"/>
 <Skeleton className="h-10 w-64"/>
 </div>
 <Skeleton className="h-6 w-96 max-w-full"/>
 </div>
 </div>

 {/* Search form skeleton */}
 <div className="relative mb-6 md:mb-8">
 {/* Floating background gradient */}
 <div className={cn(
"absolute inset-0 -inset-x-4 -inset-y-2 rounded-3xl -z-10",
"bg-gradient-to-br from-white/70 via-blue-50/30 to-indigo-50/20",
"",
"backdrop-blur-xl",
"shadow-xl shadow-primary/3"
 )} />

 <div className={cn(
"relative z-10 space-y-4 px-4 md:px-6 py-3",
"bg-gradient-to-br from-white/90 via-white/80 to-slate-50/70",
"",
"backdrop-blur-sm rounded-2xl"
 )}>
 {/* Search options skeleton */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 opacity-80">
 {/* Document Type */}
 <div className="flex flex-col gap-2">
 <Skeleton className="h-4 w-24"/>
 <div className="flex items-center gap-2">
 <Skeleton className="h-10 w-32 rounded-lg"/>
 <Skeleton className="h-10 w-40 rounded-lg"/>
 </div>
 </div>

 {/* Mode */}
 <div className="flex flex-col gap-2">
 <Skeleton className="h-4 w-16"/>
 <div className="flex items-center gap-2">
 <Skeleton className="h-10 w-24 rounded-lg"/>
 <Skeleton className="h-10 w-28 rounded-lg"/>
 </div>
 </div>

 {/* Language */}
 <div className="flex flex-col gap-2">
 <Skeleton className="h-4 w-20"/>
 <div className="flex items-center gap-2">
 <Skeleton className="h-10 w-20 rounded-lg"/>
 <Skeleton className="h-10 w-20 rounded-lg"/>
 </div>
 </div>
 </div>

 {/* Search bar skeleton */}
 <div className="flex flex-col sm:flex-row gap-4 items-end">
 <div className="relative flex-1">
 <Skeleton className="h-20 w-full rounded-2xl"/>
 </div>
 <Skeleton className="h-20 w-32 rounded-xl"/>
 </div>

 {/* Popular searches skeleton */}
 <div className="flex items-center flex-wrap gap-3 pt-3 pb-4 border-t border-slate-200/20">
 <Skeleton className="h-5 w-32"/>
 <div className="flex flex-wrap items-center gap-3">
 <Skeleton className="h-8 w-28 rounded-full"/>
 <Skeleton className="h-8 w-32 rounded-full"/>
 <Skeleton className="h-8 w-24 rounded-full"/>
 </div>
 </div>
 </div>
 </div>

 {/* Example queries skeleton */}
 <div className="mb-6 md:mb-8 w-full">
 <div className="flex items-center gap-3 mb-4 md:mb-6">
 <Skeleton className="h-6 w-6 rounded"/>
 <Skeleton className="h-6 w-40"/>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
 {[...Array(4)].map((_, i) => (
 <div
 key={i}
 className="group relative overflow-hidden rounded-xl py-3 flex flex-col h-full bg-gradient-to-br from-muted/30 to-muted/15 border border-border min-h-[200px]"
 >
 <div className="relative z-10 flex flex-col gap-4 p-5">
 <div className="flex items-center gap-3">
 <Skeleton className="h-8 w-8 rounded-lg"/>
 <Skeleton className="h-5 w-full"/>
 </div>
 <Skeleton className="h-4 w-3/4"/>
 <Skeleton className="h-4 w-full"/>
 <Skeleton className="h-4 w-5/6"/>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 {/* End of centered wrapper */}
 </div>
 );
}
