import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuickActionCardProps {
  icon: React.ReactElement<{ className?: string }>;
  title: string;
  description: string;
  stat?: string;
  href: string;
  badge?: string;
  className?: string;
}

export function QuickActionCard({
  icon,
  title,
  description,
  stat,
  href,
  badge,
  className
}: QuickActionCardProps) {
  return (
    <Link href={href}>
      <Card className={cn(
        "group relative overflow-hidden",
        "bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/20",
        "border border-slate-200/50 dark:border-slate-800/50",
        "shadow-sm hover:shadow-xl",
        "hover:scale-[1.02]",
        "transition-all duration-500",
        "cursor-pointer",
        "rounded-3xl",
        "p-6",
        "h-full flex flex-col",
        className
      )}>
        {/* Modern gradient overlay - visible by default */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-25 dark:opacity-35 group-hover:opacity-35 dark:group-hover:opacity-45 transition-opacity duration-300 -z-10 rounded-3xl",
          "from-blue-500 via-indigo-500 to-purple-500"
        )} />

        {/* Optional Badge */}
        {badge && (
          <Badge className="absolute top-4 right-4 bg-primary/90 text-primary-foreground z-10 shadow-lg border-0 backdrop-blur-sm">
            {badge}
          </Badge>
        )}

        <CardContent className="flex flex-col items-center text-center gap-5 py-2 px-2 flex-1">

          {/* Icon with modern animated background */}
          <div className={cn(
            "relative p-4 rounded-2xl",
            "bg-gradient-to-br from-blue-100/80 via-indigo-100/60 to-purple-100/80 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-purple-900/40",
            "group-hover:from-blue-200/90 group-hover:via-indigo-200/70 group-hover:to-purple-200/90 dark:group-hover:from-blue-800/50 dark:group-hover:via-indigo-800/40 dark:group-hover:to-purple-800/50",
            "group-hover:scale-110 group-hover:rotate-6",
            "transition-all duration-500",
            "shadow-md group-hover:shadow-xl",
            "border border-blue-200/50 dark:border-blue-800/30"
          )}>
            {React.cloneElement(icon, {
              className: "size-7 text-blue-700 dark:text-blue-300"
            })}
          </div>

          {/* Title with gradient */}
          <h3 className="text-xl font-semibold transition-all duration-300">
            <span className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 dark:from-slate-50 dark:via-slate-100 dark:to-slate-50 group-hover:from-blue-600 group-hover:via-indigo-600 group-hover:to-purple-600 dark:group-hover:from-blue-400 dark:group-hover:via-indigo-400 dark:group-hover:to-purple-400 bg-clip-text text-transparent">
              {title}
            </span>
          </h3>

          {/* Description */}
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed font-medium">
            {description}
          </p>

          {/* Stat Badge */}
          {stat && (
            <Badge variant="secondary" className="text-xs mt-auto px-3 py-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
              {stat}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
