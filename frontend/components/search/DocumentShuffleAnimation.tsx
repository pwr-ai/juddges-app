// components/search/DocumentShuffleAnimation.tsx

import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DocumentShuffleAnimation() {
 return (
 <div className="relative w-32 h-40 mx-auto">
 {/* Card 3 - Background */}
 <div
 className={cn(
"absolute inset-0 rounded-xl shadow-lg",
"bg-gradient-to-br from-slate-100/60 to-slate-200/40",
"",
"backdrop-blur-sm border border-slate-200/30",
"transform -rotate-3 translate-x-2 translate-y-1",
"opacity-30 animate-shuffle-back",
"motion-reduce:animate-none motion-reduce:opacity-20"
 )}
 >
 <DocumentLines className="opacity-20"/>
 </div>

 {/* Card 2 - Middle */}
 <div
 className={cn(
"absolute inset-0 rounded-xl shadow-xl",
"bg-gradient-to-br from-primary/10 via-indigo-500/10 to-purple-500/10",
"",
"backdrop-blur-sm border border-primary/20",
"transform rotate-1 translate-x-1",
"opacity-50 animate-shuffle-mid",
"motion-reduce:animate-none motion-reduce:opacity-40"
 )}
 >
 <DocumentLines className="opacity-30"/>
 </div>

 {/* Card 1 - Front (Active) */}
 <div
 className={cn(
"absolute inset-0 rounded-xl shadow-2xl overflow-hidden",
"bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/30",
"",
"backdrop-blur-md border-2 border-primary/30",
"animate-shuffle-front",
"motion-reduce:animate-none"
 )}
 >
 {/* Gradient overlay */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-indigo-500/5 to-purple-500/5"/>

 {/* Search Icon Container */}
 <div className="absolute inset-0 flex items-center justify-center z-10">
 <div className="relative">
 {/* Icon glow */}
 <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-indigo-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse"/>
 {/* Icon */}
 <div className="relative bg-gradient-to-br from-primary via-indigo-600 to-purple-600 rounded-full p-3 shadow-lg shadow-primary/30">
 <Search className="w-6 h-6 text-white"/>
 </div>
 </div>
 </div>

 {/* Pulse rings */}
 <div className="absolute inset-0 flex items-center justify-center motion-reduce:hidden z-0">
 <PulseRing delay="0s"/>
 <PulseRing delay="0.6s"/>
 <PulseRing delay="1.2s"/>
 </div>

 {/* Shine effect */}
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer-slide_3s_ease-in-out_infinite] pointer-events-none"/>
 </div>
 </div>
 );
}

// Subcomponents
function DocumentLines({ className = '' }: { className?: string }) {
 return (
 <div className={cn("absolute bottom-4 left-4 right-4 space-y-1.5", className)}>
 <div className="h-1 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full"/>
 <div className="h-1 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full w-5/6"/>
 <div className="h-1 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full w-4/6"/>
 </div>
 );
}

function PulseRing({ delay }: { delay: string }) {
 return (
 <div
 className={cn(
"absolute w-20 h-20 rounded-full",
"border-2 border-primary/40",
"animate-pulse-ring"
 )}
 style={{ animationDelay: delay }}
 aria-hidden="true"
 />
 );
}
