import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  description: string;
  features: string[];
  cta: { text: string; href: string };
  highlighted?: boolean;
}

interface PricingSectionProps {
  tiers: PricingTier[];
  title?: string;
  subtitle?: string;
  disclaimer?: string;
}

export function PricingSection({
  tiers,
  title,
  subtitle,
  disclaimer,
}: PricingSectionProps) {
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

        {/* Pricing tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={cn(
                "relative flex flex-col h-full transition-all duration-300",
                tier.highlighted
                  ? "border-primary/50 shadow-xl scale-105 lg:scale-110"
                  : "hover:shadow-lg hover:-translate-y-1"
              )}
            >
              {/* Highlighted badge */}
              {tier.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Recommended
                </Badge>
              )}

              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl mb-2">{tier.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {tier.description}
                </p>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check
                        className={cn(
                          "size-5 flex-shrink-0 mt-0.5",
                          tier.highlighted ? "text-primary" : "text-chart-2"
                        )}
                      />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  asChild
                  size="lg"
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href={tier.cta.href}>{tier.cta.text}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Disclaimer */}
        {disclaimer && (
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground max-w-3xl mx-auto">
              {disclaimer}
            </p>
          </div>
        )}

        {/* Additional info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            All plans include access to our core platform features.{" "}
            <a href="#contact" className="text-primary hover:underline font-medium">
              Contact us
            </a>{" "}
            to discuss custom pricing for your organization.
          </p>
        </div>
      </div>
    </section>
  );
}
