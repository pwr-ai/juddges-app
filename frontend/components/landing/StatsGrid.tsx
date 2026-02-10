import React from "react";
import { type LucideIcon } from "lucide-react";

interface Stat {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

interface StatsGridProps {
  stats: Stat[];
  title?: string;
}

export function StatsGrid({ stats, title }: StatsGridProps) {
  return (
    <section className="py-20 md:py-24">
      <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-7xl">
        {title && (
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            {title}
          </h2>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="group relative bg-card border border-border rounded-xl p-6 md:p-8 hover:shadow-lg hover:border-primary/50 transition-all duration-300"
              >
                {/* Icon */}
                <div className="mb-4 inline-flex p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <Icon className="size-6 md:size-7" />
                </div>

                {/* Value */}
                <div className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {stat.value}
                </div>

                {/* Label */}
                <div className="text-sm md:text-base font-medium text-foreground mb-1">
                  {stat.label}
                </div>

                {/* Description */}
                <div className="text-xs md:text-sm text-muted-foreground">
                  {stat.description}
                </div>

                {/* Hover effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
