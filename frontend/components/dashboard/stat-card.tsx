import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
 value: string | number;
 label: string;
 icon: React.ReactElement;
 trend?: "up"|"down"|"neutral"|"success";
 trendValue?: string;
 gradient?: string;
 colorScheme?: "blue"|"purple"|"amber"|"emerald"|"default";
 className?: string;
}

export function StatCard({
 value,
 label,
 icon,
 trend,
 trendValue,
 gradient ="from-primary/10 to-primary/5",
 colorScheme ="default",
 className
}: StatCardProps) {
 const getColorClasses = () => {
 switch (colorScheme) {
 case"blue":
 return {
 value: "bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 bg-clip-text text-transparent",
 iconBg: "bg-blue-100",
 iconBgHover: "group-hover:bg-blue-200",
 iconText: "text-blue-700"
 };
 case"purple":
 return {
 value: "bg-gradient-to-br from-purple-600 via-purple-500 to-violet-600 bg-clip-text text-transparent",
 iconBg: "bg-purple-100",
 iconBgHover: "group-hover:bg-purple-200",
 iconText: "text-purple-700"
 };
 case"amber":
 return {
 value: "bg-gradient-to-br from-amber-600 via-amber-500 to-orange-600 bg-clip-text text-transparent",
 iconBg: "bg-amber-100",
 iconBgHover: "group-hover:bg-amber-200",
 iconText: "text-amber-700"
 };
 case"emerald":
 return {
 value: "bg-gradient-to-br from-emerald-600 via-emerald-500 to-green-600 bg-clip-text text-transparent",
 iconBg: "bg-emerald-100",
 iconBgHover: "group-hover:bg-emerald-200",
 iconText: "text-emerald-700"
 };
 default:
 return {
 value: "bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent",
 iconBg: "bg-slate-100",
 iconBgHover: "group-hover:bg-slate-200",
 iconText: "text-slate-700"
 };
 }
 };

 const colors = getColorClasses();
 const getTrendIcon = () => {
 switch (trend) {
 case"up":
 return <TrendingUp className="size-4 text-green-600"/>;
 case"down":
 return <TrendingDown className="size-4 text-red-600"/>;
 case"neutral":
 return <Minus className="size-4 text-muted-foreground"/>;
 case"success":
 return <TrendingUp className="size-4 text-green-600"/>;
 default:
 return null;
 }
 };

 const getTrendColor = () => {
 switch (trend) {
 case"up":
 case"success":
 return"text-green-600";
 case"down":
 return"text-red-600";
 default:
 return"text-muted-foreground";
 }
 };

 const getBackgroundGradient = () => {
 switch (colorScheme) {
 case"blue":
 return"bg-gradient-to-br from-blue-50/8 via-indigo-50/5 to-blue-50/3";
 case"purple":
 // Purple scheme: use indigo/blue background instead, keep purple only for icons
 return"bg-gradient-to-br from-indigo-50/8 via-blue-50/5 to-indigo-50/3";
 case"amber":
 return"bg-gradient-to-br from-amber-50/8 via-orange-50/5 to-amber-50/3";
 case"emerald":
 return"bg-gradient-to-br from-emerald-50/8 via-green-50/5 to-emerald-50/3";
 default:
 return"bg-gradient-to-br from-slate-50/8 via-slate-50/5 to-slate-50/3";
 }
 };

 return (
 <Card className={cn(
"relative overflow-hidden group transition-all duration-500",
 getBackgroundGradient(),
"border border-slate-200/50",
"shadow-sm hover:shadow-xl hover:scale-[1.02]",
"rounded-2xl",
"p-6",
"h-full flex flex-col",
 className
 )}>
 {/* Enhanced gradient overlay on hover */}
 <div className={cn(
"absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-25 transition-opacity duration-300 -z-10 rounded-2xl",
 gradient
 )} />

 <div className="space-y-4 relative z-10 flex-1 flex flex-col">
 {/* Value and Icon - aligned horizontally */}
 <div className="flex items-start justify-between gap-3 flex-1">
 {/* Value - Large, bold, modern Apple style */}
 <div className="flex flex-col gap-0.5 flex-1">
 {(() => {
 // Check if value is a date (DD/MM/YYYY format)
 const isDate = typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value);
 const fontSize = isDate ? "text-3xl": "text-4xl";
 return (
 <span className={cn(fontSize,"font-semibold tracking-tight leading-none", colors.value)}>
 {label
 ? value
 : typeof value === 'string' && value.includes(' ')
 ? value.split(' ')[0]
 : value}
 </span>
 );
 })()}
 {label ? (
 <span className={cn("text-lg font-medium tracking-tight leading-tight opacity-70", colors.value)}>
 {label}
 </span>
 ) : typeof value === 'string' && value.includes(' ') && (
 <span className={cn("text-lg font-medium tracking-tight leading-tight opacity-70", colors.value)}>
 {value.split(' ').slice(1).join(' ')}
 </span>
 )}
 </div>

 {/* Icon and Trend indicator - aligned with statistics */}
 <div className="flex items-center gap-2 shrink-0">
 {icon && (
 <div className={cn("p-2.5 rounded-xl transition-all duration-500 rotate-12 group-hover:rotate-6 group-hover:scale-110", colors.iconBg, colors.iconBgHover)}>
 {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
 {React.cloneElement(icon as React.ReactElement<any>, {
 className: cn("size-6", colors.iconText)
 })}
 </div>
 )}
 {trend && getTrendIcon()}
 </div>
 </div>

 {/* Trend Value */}
 {trendValue && (
 <div className="flex items-center justify-end pt-1">
 <div className={cn("text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 backdrop-blur-sm", getTrendColor())}>
 {trendValue}
 </div>
 </div>
 )}
 </div>
 </Card>
 );
}
