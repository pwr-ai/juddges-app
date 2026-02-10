import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeploymentOption {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  bestFor: string;
  recommended?: boolean;
}

interface DeploymentOptionsProps {
  options: DeploymentOption[];
  title?: string;
  subtitle?: string;
}

export function DeploymentOptions({
  options,
  title,
  subtitle,
}: DeploymentOptionsProps) {
  const [selected, setSelected] = useState(
    options.find((opt) => opt.recommended)?.id || options[0]?.id
  );

  return (
    <section className="py-20 md:py-24">
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

        {/* Options grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {options.map((option) => {
            const Icon = option.icon;
            const isSelected = selected === option.id;

            return (
              <Card
                key={option.id}
                className={cn(
                  "relative cursor-pointer transition-all duration-300 h-full",
                  "hover:shadow-xl hover:-translate-y-1",
                  isSelected
                    ? "border-primary/50 shadow-lg ring-2 ring-primary/20"
                    : "hover:border-primary/30"
                )}
                onClick={() => setSelected(option.id)}
              >
                {/* Recommended badge */}
                {option.recommended && (
                  <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground">
                    Recommended
                  </Badge>
                )}

                <CardHeader>
                  {/* Icon */}
                  <div
                    className={cn(
                      "inline-flex p-3 rounded-lg mb-4 transition-all duration-300",
                      isSelected
                        ? "bg-primary text-primary-foreground scale-110"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    <Icon className="size-7" />
                  </div>

                  <CardTitle className="text-xl">{option.title}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Description */}
                  <p className="text-sm text-muted-foreground">
                    {option.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2.5">
                    {option.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2.5">
                        <Check
                          className={cn(
                            "size-5 flex-shrink-0 mt-0.5",
                            isSelected ? "text-primary" : "text-chart-2"
                          )}
                        />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Best for */}
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">
                      Best for:
                    </p>
                    <p className="text-sm font-medium">{option.bestFor}</p>
                  </div>
                </CardContent>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-xl pointer-events-none" />
                )}
              </Card>
            );
          })}
        </div>

        {/* Bottom note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Not sure which deployment option is right for you?{" "}
            <a href="#contact" className="text-primary hover:underline font-medium">
              Contact our team
            </a>{" "}
            for a personalized consultation.
          </p>
        </div>
      </div>
    </section>
  );
}
