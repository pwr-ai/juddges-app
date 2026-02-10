import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type LucideIcon } from "lucide-react";

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  details: string[];
  tags: string[];
}

interface FeatureShowcaseProps {
  features: Feature[];
  title?: string;
  subtitle?: string;
}

export function FeatureShowcase({
  features,
  title,
  subtitle,
}: FeatureShowcaseProps) {
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

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <Card
                key={feature.id}
                className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 h-full"
              >
                <CardHeader>
                  {/* Icon */}
                  <div className="inline-flex p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 transition-all duration-300 mb-4">
                    <Icon className="size-6" />
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {feature.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {feature.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Description */}
                  <p className="text-muted-foreground text-sm">
                    {feature.description}
                  </p>

                  {/* Details */}
                  <ul className="space-y-2">
                    {feature.details.map((detail, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm"
                      >
                        <div className="size-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <span className="text-foreground/80">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
