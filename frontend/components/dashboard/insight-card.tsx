import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface InsightCardProps {
 title: string;
 icon: React.ReactElement<{ className?: string }>;
 children: React.ReactNode;
 colorScheme?: "blue"|"purple"|"amber"|"emerald"|"default";
}

export function InsightCard({ title, icon, children, colorScheme ="default"}: InsightCardProps) {
 const getBackgroundGradient = () => {
 switch (colorScheme) {
 case 'blue':
 return 'bg-gradient-to-br from-blue-50/8 via-indigo-50/5 to-blue-50/3';
 case 'purple':
 // Purple scheme: use indigo/blue background instead, keep purple only for icons
 return 'bg-gradient-to-br from-indigo-50/8 via-blue-50/5 to-indigo-50/3';
 case 'amber':
 return 'bg-gradient-to-br from-amber-50/8 via-orange-50/5 to-amber-50/3';
 case 'emerald':
 return 'bg-gradient-to-br from-emerald-50/8 via-green-50/5 to-emerald-50/3';
 default:
 return 'bg-gradient-to-br from-slate-50/8 via-slate-50/5 to-slate-50/3';
 }
 };

 const getHoverGradient = () => {
 switch (colorScheme) {
 case 'blue':
 return 'from-blue-500 via-indigo-500 to-blue-500';
 case 'purple':
 // Purple scheme: use indigo/blue gradient instead
 return 'from-indigo-500 via-blue-500 to-indigo-500';
 case 'amber':
 return 'from-amber-500 via-orange-500 to-amber-500';
 case 'emerald':
 return 'from-emerald-500 via-green-500 to-emerald-500';
 default:
 return 'from-slate-500 via-slate-400 to-slate-500';
 }
 };

 const getIconColor = () => {
 switch (colorScheme) {
 case 'blue':
 return 'text-blue-700';
 case 'purple':
 return 'text-purple-700';
 case 'amber':
 return 'text-amber-700';
 case 'emerald':
 return 'text-emerald-700';
 default:
 return 'text-slate-700';
 }
 };

 return (
 <Card className={cn(
"group relative overflow-hidden",
"bg-white",
"border-0 shadow-sm hover:shadow-xl",
"hover:scale-[1.02]",
"transition-all duration-500",
"rounded-3xl",
"p-6",
"flex flex-col",
 // Legal Glass Night Mode - Dark Mode Card
"", /* Slate 800 with transparency */
"", /* 10% White */
"", /* Remove shadows */
"", /* No hover shadows in dark mode */
 getBackgroundGradient()
 )}>
 {/* Modern gradient overlay - visible by default */}
 <div className={cn(
"absolute inset-0 bg-gradient-to-br opacity-10 group-hover:opacity-20 transition-opacity duration-300 -z-10 rounded-3xl",
 getHoverGradient()
 )} />

 <CardHeader className="pb-3 px-0 pt-0">
 <div className="flex items-center justify-between">
 <CardTitle className="text-base font-semibold transition-all duration-300">
 <span className={cn(
"bg-gradient-to-br bg-clip-text text-transparent",
 colorScheme === 'blue'
 ? "from-slate-900 via-slate-700 to-slate-900 group-hover:from-blue-600 group-hover:via-indigo-600 group-hover:to-blue-600"
 : colorScheme === 'purple'
 ? "from-slate-900 via-slate-700 to-slate-900 group-hover:from-indigo-600 group-hover:via-blue-600 group-hover:to-indigo-600"
 : colorScheme === 'amber'
 ? "from-slate-900 via-slate-700 to-slate-900 group-hover:from-amber-600 group-hover:via-orange-600 group-hover:to-amber-600"
 : colorScheme === 'emerald'
 ? "from-slate-900 via-slate-700 to-slate-900 group-hover:from-emerald-600 group-hover:via-green-600 group-hover:to-emerald-600"
 : "from-slate-900 via-slate-700 to-slate-900 group-hover:from-slate-600 group-hover:via-slate-500 group-hover:to-slate-600"
 )}>
 {title}
 </span>
 </CardTitle>
 <div className={cn(
"p-2 rounded-xl bg-white/60 backdrop-blur-sm border border-slate-200/50 shadow-sm group-hover:shadow-md transition-all duration-300",
"group-hover:scale-110 group-hover:rotate-6"
 )}>
 {React.cloneElement(icon, {
 className: cn("size-4", getIconColor())
 })}
 </div>
 </div>
 </CardHeader>
 <CardContent className="pt-0 px-0">
 {children}
 </CardContent>
 </Card>
 );
}
