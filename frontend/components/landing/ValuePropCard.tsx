import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ValuePropCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
  variant?: "default" | "highlighted";
}

export function ValuePropCard({
  icon: Icon,
  title,
  description,
  features,
  variant = "default",
}: ValuePropCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden h-full",
        "hover:shadow-xl hover:-translate-y-1",
        "transition-all duration-300",
        variant === "highlighted" && "border-primary/50 shadow-lg"
      )}
    >
      <CardContent className="p-8">
        {/* Icon */}
        <div
          className={cn(
            "inline-flex p-4 rounded-xl mb-6",
            "bg-primary/10 text-primary",
            "group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110",
            "transition-all duration-300"
          )}
        >
          <Icon className="size-8" />
        </div>

        {/* Title */}
        <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
          {title}
        </h3>

        {/* Description */}
        <p className="text-muted-foreground mb-6 leading-relaxed">
          {description}
        </p>

        {/* Features */}
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Check className="size-5 text-chart-2" />
              </div>
              <span className="text-sm text-foreground/90">{feature}</span>
            </li>
          ))}
        </ul>

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </CardContent>
    </Card>
  );
}

interface ValuePropsGridProps {
  valueProps: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
    features: string[];
  }>;
  title?: string;
  subtitle?: string;
}

export function ValuePropsGrid({
  valueProps,
  title,
  subtitle,
}: ValuePropsGridProps) {
  return (
    <section className="py-20 md:py-24 bg-muted/20">
      <div className="container mx-auto px-6 md:px-8 lg:px-12 max-w-7xl">
        {/* Section header */}
        {(title || subtitle) && (
          <div className="text-center mb-16">
            {title && (
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
            )}
            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {valueProps.map((prop, index) => (
            <ValuePropCard
              key={index}
              icon={prop.icon}
              title={prop.title}
              description={prop.description}
              features={prop.features}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
